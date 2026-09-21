import {expect, it} from 'vitest';
import {createDesertDusk, desertGroundY, desertSeek, desertSpan} from './desertDusk';
import {DESERT_PALETTE, desertPaletteFromPixels} from './palette';

it('preserves the journey seed and uses a flat envelope while peaks are missing', () => {
    const empty = createDesertDusk('journey', null);
    expect(empty).toEqual(createDesertDusk('journey', new Uint8Array()));
    expect(empty.dunes.every(value => value === 0)).toBe(true);
    for (const length of [1, 17, 128, 8192]) {
        const loud = createDesertDusk('journey', new Uint8Array(length).fill(255));
        expect(loud.seed).toBe(empty.seed);
        expect(loud.dunes).toHaveLength(128);
        expect(loud.dunes.every(value => value === 1)).toBe(true);
        expect(loud.distant.every(value => value === 1)).toBe(true);
    }
});

it('rounds sharp peaks into broad dunes without mutating the waveform', () => {
    const peaks = new Uint8Array(128); peaks[64] = 255;
    const scene = createDesertDusk('journey', peaks);
    expect(scene.distant[64]).toBeLessThan(scene.dunes[64]);
    expect(scene.distant[54]).toBeGreaterThan(0);
    expect(scene.dunes[54]).toBe(0);
    expect(peaks[64]).toBe(255);
});

it('bounds drag seeks, including short recordings and unavailable duration', () => {
    expect(desertSeek(60, -400, 800, 240)).toBe(85);
    expect(desertSeek(60, 400, 800, 240)).toBe(35);
    expect(desertSeek(1, 800, 800, 3)).toBe(0);
    expect(desertSeek(1, -800, 800, 3)).toBe(3);
    expect(desertSeek(60, 400, 0, 240)).toBe(60);
    expect(desertSeek(60, 400, 800, 0)).toBe(60);
    expect(desertSpan(7200)).toBe(220);
});

it('keeps landmark terrain smooth and independent of playback resources', () => {
    for (const height of [390, 844, 900]) {
        const scale = Math.min(1.4, Math.max(0.55, height / 850));
        for (let x = -3000; x <= 3000; x += 19) {
            const y = desertGroundY(x, height, scale);
            expect(y).toBeGreaterThan(height * 0.72);
            expect(y).toBeLessThan(height * 0.86);
            expect(Math.abs(desertGroundY(x + 1, height, scale) - y)).toBeLessThan(0.25);
        }
    }
});

it('takes dusk accents from artwork while preserving warm sand and stone', () => {
    const blue = desertPaletteFromPixels(Uint8ClampedArray.of(40, 80, 220, 255));
    const rose = desertPaletteFromPixels(Uint8ClampedArray.of(220, 40, 90, 255));
    expect(blue.haze).not.toBe(rose.haze);
    expect(blue.accent).not.toBe(rose.accent);
    for (const palette of [blue, rose]) {
        expect(palette.sand).toBe(DESERT_PALETTE.sand);
        expect(palette.stone).toBe(DESERT_PALETTE.stone);
    }
    expect(desertPaletteFromPixels(Uint8ClampedArray.of(100, 100, 100, 255))).toEqual(DESERT_PALETTE);
    expect(desertPaletteFromPixels(Uint8ClampedArray.of(220, 40, 90, 0))).toEqual(DESERT_PALETTE);
});
