import {describe, expect, it} from 'vitest';
import {createShrinePath, shrineSeek, shrineSpan} from './shrinePath';
import {SHRINE_PALETTE, shrinePaletteFromPixels} from './palette';

describe('shrine path', () => {
    it('uses flat ridges until a waveform arrives without changing the scenery seed', () => {
        const empty = createShrinePath('journey', null);
        const silent = createShrinePath('journey', new Uint8Array(40));
        const loud = createShrinePath('journey', new Uint8Array(40).fill(255));
        expect(empty).toEqual(createShrinePath('journey', new Uint8Array()));
        expect(empty.ridges.every(value => value === 0)).toBe(true);
        expect(empty.hills.every(value => value === 0)).toBe(true);
        expect(silent.seed).toBe(loud.seed);
        expect(loud.seed).toBe(empty.seed);
        expect(loud.ridges.every(value => value === 1)).toBe(true);
        expect(loud.hills.every(value => value === 1)).toBe(true);
    });

    it('smooths isolated peaks more heavily in distant mountains', () => {
        const peaks = new Uint8Array(100);
        peaks[50] = 255;
        const scene = createShrinePath('journey', peaks);
        expect(scene.ridges[50]).toBeLessThan(scene.hills[50]);
        expect(scene.ridges[41]).toBeGreaterThan(0);
        expect(scene.hills[41]).toBe(0);
        expect(peaks[50]).toBe(255);
    });

    it('maps dragging to the recording and bounds seeks for short and long tracks', () => {
        expect(shrineSeek(60, -400, 800, 240)).toBe(82.5);
        expect(shrineSeek(60, 400, 800, 240)).toBe(37.5);
        expect(shrineSeek(2, -800, 800, 5)).toBe(5);
        expect(shrineSeek(2, 800, 800, 5)).toBe(0);
        expect(shrineSeek(12, 300, 0, 240)).toBe(12);
        expect(shrineSeek(12, 300, 800, 0)).toBe(12);
        expect(shrineSpan(7200)).toBe(200);
    });

    it('takes soft landscape colors from artwork while preserving gates, timber, and warm lanterns', () => {
        const rose = shrinePaletteFromPixels(Uint8ClampedArray.of(210, 50, 100, 255));
        const blue = shrinePaletteFromPixels(Uint8ClampedArray.of(40, 90, 200, 255));
        expect(rose.accent).not.toBe(blue.accent);
        expect(rose.horizon).not.toBe(blue.horizon);
        expect(rose.mountain).not.toBe(blue.mountain);
        for (const palette of [rose, blue]) {
            expect(palette.vermilion).toBe(SHRINE_PALETTE.vermilion);
            expect(palette.timber).toBe(SHRINE_PALETTE.timber);
            expect(palette.lantern).toBe(SHRINE_PALETTE.lantern);
            expect(palette.sky).toBe(SHRINE_PALETTE.sky);
        }
    });

    it('keeps the default palette for transparent or grayscale artwork', () => {
        expect(shrinePaletteFromPixels(Uint8ClampedArray.of(220, 60, 40, 0))).toEqual(SHRINE_PALETTE);
        expect(shrinePaletteFromPixels(Uint8ClampedArray.of(140, 140, 140, 255))).toEqual(SHRINE_PALETTE);
    });
});
