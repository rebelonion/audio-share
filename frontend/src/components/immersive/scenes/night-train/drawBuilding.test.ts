import {expect, it, vi} from 'vitest';
import {drawBuilding} from './drawBuilding';

it.each([10, 14, 18, 28, 80])('keeps the same light responsive throughout a building passage at height %s', height => {
    const gradient = {addColorStop() {}};
    const halo = vi.fn<(...args: number[]) => typeof gradient>(() => gradient);
    const highlights: number[] = [];
    const state: Record<string, unknown> = {};
    const ctx = new Proxy(state, {
        get: (target, key) => {
            if (key === 'createRadialGradient') return halo;
            if (key === 'fillRect') return () => {
                if (target.fillStyle === '#fff0c4') highlights.push(target.globalAlpha as number);
            };
            return String(key).startsWith('create') ? () => gradient : () => {};
        },
    }) as unknown as CanvasRenderingContext2D;
    let responsiveBuildings = 0;
    for (let building = 0; building < 32; building++) {
        let selected: boolean | undefined;
        let lightPosition: number[] | undefined;
        for (const [step, level] of [0.2, 0.4, 0.1, 0, 0.3].entries()) {
            const x = 800 - step * 200;
            halo.mockClear();
            highlights.length = 0;
            drawBuilding(ctx, 42, building, x, 200, 45, height, 1, '#e9bb7d', level);
            if (level === 0) {
                expect(halo).not.toHaveBeenCalled();
                continue;
            }
            selected ??= halo.mock.calls.length > 0;
            expect(halo.mock.calls.length).toBe(selected ? 1 : 0);
            if (selected) {
                const [hx, hy] = halo.mock.calls[0];
                lightPosition ??= [hx - x, hy];
                expect(hx - x).toBeCloseTo(lightPosition[0]);
                expect(hy).toBeCloseTo(lightPosition[1]);
                expect(highlights[0]).toBeCloseTo(level * 1.4);
            }
        }
        if (selected) responsiveBuildings++;
    }
    expect(responsiveBuildings).toBeGreaterThan(0);
    expect(responsiveBuildings).toBeLessThan(16);
});
