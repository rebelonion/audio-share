import {describe, expect, it} from 'vitest';
import {createPond, DROP_COUNT, DROP_LIFETIME, fishPose, padContains, POND_PALETTE, pondPaletteFromPixels, positionPads, rainDrops, surfaceSlope} from './pond';

const pond = createPond('moonlit-study', null);

describe('pond continuity and perspective', () => {
    it('preserves living scenery when artwork or waveform data arrives', () => {
        const loaded = createPond('moonlit-study', Uint8Array.of(40, 230, 80), {...POND_PALETTE, flower: '#aabbcc'});
        expect(loaded.fish).toEqual(pond.fish);
        expect(loaded.pads).toEqual(pond.pads);
        expect(loaded.shimmer.some(value => value > 0)).toBe(true);
        expect(pond.shimmer.every(value => value === 0)).toBe(true);
    });

    it('keeps moonlit water and leaves stable when artwork changes', () => {
        const palette = pondPaletteFromPixels(Uint8ClampedArray.of(230, 40, 70, 255));
        expect(palette.flower).not.toBe(POND_PALETTE.flower);
        expect(palette.water).toBe(POND_PALETTE.water);
        expect(palette.leaf).toBe(POND_PALETTE.leaf);
    });

    it.each([[1280, 800], [390, 844], [844, 390]])('keeps fish paths continuous at %i × %i over ten minutes', (width, height) => {
        for (const fish of pond.fish) {
            for (let time = 0; time < 600; time += 0.5) {
                const a = fishPose(fish, time, width, height);
                const b = fishPose(fish, time + 1 / 30, width, height);
                const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
                expect(Math.abs(turn)).toBeLessThan(0.03);
                expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(2);
                expect(a.speed).toBeGreaterThan(0);
                expect(a.x).toBeGreaterThan(0);
                expect(a.x).toBeLessThan(width);
                expect(a.y).toBeGreaterThan(0);
                expect(a.y).toBeLessThan(height);
            }
        }
    });

    it('keeps all ambient state deterministic when time is frozen', () => {
        expect(positionPads(pond.pads, 42, 1280, 800)).toEqual(positionPads(pond.pads, 42, 1280, 800));
        expect(rainDrops(pond.seed, 42, 1280, 800, pond.pads)).toEqual(rainDrops(pond.seed, 42, 1280, 800, pond.pads));
        expect(fishPose(pond.fish[0], 42, 1280, 800)).toEqual(fishPose(pond.fish[0], 42, 1280, 800));
    });
});

describe('rain and lily pad interactions', () => {
    it('treats the notch as water and the leaf as solid, including rotated pads', () => {
        const pad = {...positionPads(pond.pads, 0, 1280, 800)[0], x: 100, y: 100, radius: 40, angle: 0};
        expect(padContains(pad, 120, 100)).toBe(false);
        expect(padContains(pad, 80, 100)).toBe(true);
        expect(padContains(pad, 100, 150)).toBe(false);
        expect(padContains({...pad, angle: Math.PI / 2}, 100, 120)).toBe(false);
        expect(padContains({...pad, angle: Math.PI / 2}, 100, 80)).toBe(true);
    });

    it('classifies leaf impacts at the instant of contact and does not create water ripples for them', () => {
        const drops = rainDrops(pond.seed, 12, 1280, 800, []);
        const drop = drops[0];
        const pad = {x: drop.x / 1280 + 0.006, y: drop.y / 800, radius: 0.1, angle: 0, phase: 0, flower: false};
        const impacts = rainDrops(pond.seed, 12, 1280, 800, [pad]);
        const impact = impacts.find(value => value.x === drop.x && value.y === drop.y)!;
        expect(impact.onPad).toBe(0);
        expect(surfaceSlope(drop.x + 30, drop.y, 12, [impact], 800))
            .toEqual(surfaceSlope(drop.x + 30, drop.y, 12, [], 800));
    });

    it('keeps impacts in place as rings expand and creates bounded rain over long sessions', () => {
        for (let time = 0; time < 300; time += 0.5) {
            const drops = rainDrops(pond.seed, time, 1280, 800, pond.pads);
            const next = rainDrops(pond.seed, time + 0.02, 1280, 800, pond.pads);
            expect(drops.length).toBeLessThanOrEqual(DROP_COUNT);
            for (const drop of drops) {
                expect(drop.age).toBeGreaterThanOrEqual(0);
                expect(drop.age).toBeLessThanOrEqual(DROP_LIFETIME);
                const later = next.find(value => value.x === drop.x && value.y === drop.y);
                if (later) {
                    expect(later.age).toBeCloseTo(drop.age + 0.02);
                    expect(later.onPad).toBe(drop.onPad);
                }
            }
        }
    });

    it('has a finite surface at the impact center and deforms the reflection as the front passes', () => {
        const drop = {x: 200, y: 200, age: 0.4, strength: 1, onPad: -1};
        const center = surfaceSlope(200, 200, 3, [drop], 800);
        expect(Number.isFinite(center.x) && Number.isFinite(center.y)).toBe(true);
        const baseline = surfaceSlope(230, 200, 3, [], 800);
        const disturbed = surfaceSlope(230, 200, 3, [drop], 800);
        expect(Math.abs(disturbed.x - baseline.x)).toBeGreaterThan(0.01);
        expect(disturbed.y).toBeCloseTo(baseline.y);
    });
});
