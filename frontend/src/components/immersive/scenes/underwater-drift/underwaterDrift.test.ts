import {expect, it} from 'vitest';
import {createUnderwaterDrift, seabedY, underwaterSeek, underwaterSpan} from './underwaterDrift';
import {UNDERWATER_PALETTE, underwaterPaletteFromPixels} from './palette';

it('preserves the journey seed with missing, short, and late waveforms', () => {
    const empty = createUnderwaterDrift('journey', null);
    expect(empty).toEqual(createUnderwaterDrift('journey', new Uint8Array()));
    expect(empty.distant.every(value => value === 0)).toBe(true);
    expect(empty.ridge.every(value => value === 0)).toBe(true);
    for (const length of [1, 17, 96, 500, 8192]) {
        const loud = createUnderwaterDrift('journey', new Uint8Array(length).fill(255));
        expect(loud.seed).toBe(empty.seed);
        expect(loud.distant.every(value => value === 1)).toBe(true);
        expect(loud.ridge.every(value => value === 1)).toBe(true);
    }
});

it('softens isolated peaks more strongly in the distant ridge without changing the recording', () => {
    const peaks = new Uint8Array(96); peaks[48] = 255;
    const scene = createUnderwaterDrift('journey', peaks);
    expect(scene.distant[48]).toBeLessThan(scene.ridge[48]);
    expect(scene.distant[58]).toBeGreaterThan(0);
    expect(scene.ridge[58]).toBe(0);
    expect(peaks[48]).toBe(255);
    expect(peaks.filter(value => value !== 0)).toHaveLength(1);
});

it('keeps drag seeking bounded across short, long, and unavailable recordings', () => {
    expect(underwaterSeek(60, -400, 800, 240)).toBe(92.5);
    expect(underwaterSeek(60, 400, 800, 240)).toBe(27.5);
    expect(underwaterSeek(1, 800, 800, 3)).toBe(0);
    expect(underwaterSeek(1, -800, 800, 3)).toBe(3);
    expect(underwaterSeek(60, 400, 0, 240)).toBe(60);
    expect(underwaterSeek(60, 400, 800, 0)).toBe(60);
    expect(underwaterSpan(0)).toBeGreaterThan(0);
    expect(underwaterSpan(7200)).toBe(250);
});

it('provides smooth, stable reef ground across portrait and landscape sizes', () => {
    for (const height of [390, 844, 900]) {
        const scale = Math.min(1.4, Math.max(0.55, height / 850));
        for (let world = -3000; world <= 3000; world += 19) {
            const y = seabedY(world, height, scale);
            expect(y).toBeGreaterThan(height * 0.81);
            expect(y).toBeLessThan(height * 0.93);
            expect(Math.abs(seabedY(world + 1, height, scale) - y)).toBeLessThan(0.2);
        }
    }
});

it('tints coral, jellyfish, and controls while preserving the ocean and kelp colors', () => {
    const blue = underwaterPaletteFromPixels(Uint8ClampedArray.of(40, 80, 220, 255));
    const rose = underwaterPaletteFromPixels(Uint8ClampedArray.of(220, 40, 90, 255));
    for (const key of ['coral', 'coralShadow', 'glow', 'accent'] as const) expect(blue[key]).not.toBe(rose[key]);
    for (const palette of [blue, rose]) {
        for (const key of ['water', 'deep', 'surface', 'ground', 'kelp'] as const) expect(palette[key]).toBe(UNDERWATER_PALETTE[key]);
    }
    expect(underwaterPaletteFromPixels(Uint8ClampedArray.of(100, 100, 100, 255))).toEqual(UNDERWATER_PALETTE);
    expect(underwaterPaletteFromPixels(Uint8ClampedArray.of(220, 40, 90, 0))).toEqual(UNDERWATER_PALETTE);
});
