import {afterEach, expect, it, vi} from 'vitest';
import {drawNightTrain} from './drawNightTrain';
import {drawBuilding} from './drawBuilding';
import {createNightTrain, trainSpan} from './nightTrain';

vi.mock('./drawBuilding', () => ({drawBuilding: vi.fn()}));
vi.mock('./drawInterior', () => ({drawCarriageSeat: vi.fn()}));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('keeps building speed and waveform heights consistent across viewport widths', () => {
    vi.stubGlobal('Path2D', class {roundRect() {}});
    const gradient = {addColorStop() {}};
    const ctx = new Proxy({}, {
        get: (_, name) => String(name).startsWith('create') ? () => gradient : () => {},
    }) as CanvasRenderingContext2D;
    const scene = createNightTrain('track', Uint8Array.from({length: 512}, (_, i) => i % 256));
    const duration = 120;
    const buildingsAt = (width: number, time: number) => {
        vi.mocked(drawBuilding).mockClear();
        drawNightTrain(ctx, scene, {
            width, height: 800, time, duration, travel: time / trainSpan(duration),
            travelSpan: trainSpan(duration), ambientTime: time, pointerX: 0, pointerY: 0, moving: true,
            layers: [{data: scene, time, duration, weight: 1}],
        });
        return new Map(vi.mocked(drawBuilding).mock.calls.map(call => [call[2], {x: call[3], height: call[6]}]));
    };
    for (const width of [390, 844, 1440]) {
        const before = buildingsAt(width, 10);
        const after = buildingsAt(width, 11);
        const shared = [...before.keys()].filter(id => after.has(id));
        expect(shared.length).toBeGreaterThan(0);
        for (const id of shared) {
            expect(after.get(id)!.x - before.get(id)!.x).toBeCloseTo(-36);
            expect(after.get(id)!.height).toBeCloseTo(before.get(id)!.height);
        }
    }
});
