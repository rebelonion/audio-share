import {describe, expect, it} from 'vitest';
import {DUSK_PALETTE, travelerSeek, paletteFromPixels} from './traveler';

describe('traveler scene', () => {
    it('drags forward by pulling left and clamps seeking at both ends', () => {
        expect(travelerSeek(50, -500, 1000, 100)).toBe(66);
        expect(travelerSeek(50, 500, 1000, 100)).toBe(34);
        expect(travelerSeek(1, 500, 1000, 100)).toBe(0);
        expect(travelerSeek(99, -500, 1000, 100)).toBe(100);
        expect(travelerSeek(10, 200, 0, 100)).toBe(10);
        expect(travelerSeek(10, 200, 1000, 0)).toBe(10);
    });

    it('uses dusk for monochrome artwork and a stable tint for colored artwork', () => {
        expect(paletteFromPixels(Uint8ClampedArray.from([100, 100, 100, 255]))).toEqual(DUSK_PALETTE);
        expect(paletteFromPixels(Uint8ClampedArray.from([200, 50, 50, 0]))).toEqual(DUSK_PALETTE);
        const colors = Uint8ClampedArray.from([200, 50, 50, 255, 220, 60, 60, 255]);
        expect(paletteFromPixels(colors)).not.toEqual(DUSK_PALETTE);
        expect(paletteFromPixels(colors)).toEqual(paletteFromPixels(colors));
    });
});
