import {afterEach, expect, it, vi} from 'vitest';
import {drawFish} from './drawFish';
import {createPond, fishPose, rainDrops, surfaceSlope} from './pond';

afterEach(() => vi.unstubAllGlobals());

it.each([[390, 844], [1280, 800]])('keeps the rendered fish steady through a rain crossing at %i × %i', (width, height) => {
    vi.stubGlobal('Path2D', class {
        moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {}
    });
    const translate = vi.fn();
    const ctx = new Proxy({translate, createLinearGradient: () => ({addColorStop() {}})}, {
        get: (target, key) => Reflect.get(target, key) ?? (() => {}),
    }) as unknown as CanvasRenderingContext2D;
    const pond = createPond('moonlit-study', null);
    const fish = pond.fish[5];
    const scale = Math.min(width, height);
    let previous: {x: number; y: number; dx: number; dy: number} | undefined;
    let maxJolt = 0;
    let maxRainSlope = 0;
    // This seeded impact used to shove the fish several pixels back and forth.
    for (let frame = 0; frame <= 30; frame++) {
        const time = 31.5 + frame / 30;
        const pose = fishPose(fish, time, width, height);
        const drops = rainDrops(pond.seed, time, width, height, pond.pads);
        const rain = surfaceSlope(pose.x, pose.y, time, drops, scale);
        const calm = surfaceSlope(pose.x, pose.y, time, [], scale);
        maxRainSlope = Math.max(maxRainSlope, Math.hypot(rain.x - calm.x, rain.y - calm.y));
        drawFish(ctx, fish, time, width, height);
        const [x, y] = translate.mock.lastCall! as [number, number];
        const dx = previous ? x - previous.x : 0;
        const dy = previous ? y - previous.y : 0;
        if (frame > 1) maxJolt = Math.max(maxJolt, Math.hypot(dx - previous!.dx, dy - previous!.dy));
        previous = {x, y, dx, dy};
    }
    expect(maxRainSlope).toBeGreaterThan(0.02);
    expect(maxJolt).toBeLessThan(0.02);
});
