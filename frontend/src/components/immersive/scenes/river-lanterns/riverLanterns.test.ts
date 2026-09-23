import {describe, expect, it} from 'vitest';
import {createRiverLanterns, projectLantern, RIVER_PALETTE, riverPaletteFromPixels} from './riverLanterns';

describe('river lantern continuity', () => {
    it('preserves lantern positions when artwork and waveform arrive', () => {
        const initial = createRiverLanterns('recording', null);
        const loaded = createRiverLanterns('recording', Uint8Array.of(20, 240, 80), {...RIVER_PALETTE, haze: '#334455'});
        expect(initial.lanterns).toEqual(loaded.lanterns);
        expect(initial.shimmer.every(value => value === 0)).toBe(true);
        expect(loaded.shimmer.some(value => value > 0)).toBe(true);
        expect(loaded.shimmer.every(value => value >= 0 && value <= 1)).toBe(true);
    });

    it('moves lanterns toward the viewer and grows them with perspective', () => {
        const lantern = {...createRiverLanterns('river', null).lanterns[0], phase: 0.5};
        const first = projectLantern(lantern, 0, 1280, 800);
        const next = projectLantern(lantern, 1, 1280, 800);
        expect(next.y).toBeGreaterThan(first.y);
        expect(next.size).toBeGreaterThan(first.size);
        expect(next.y - first.y).toBeLessThan(10);
    });

    it('recycles beyond the bottom of the view and fades in at the horizon', () => {
        const lantern = {...createRiverLanterns('river', null).lanterns[0], phase: 0.99999, size: 1.2};
        for (const [width, height] of [[1280, 800], [390, 844], [844, 390]]) {
            const exiting = projectLantern(lantern, 0, width, height);
            expect(exiting.y - exiting.size * 1.1).toBeGreaterThan(height);
            const entering = projectLantern({...lantern, phase: 0}, 0, width, height);
            expect(entering.opacity).toBe(0);
            expect(entering.y).toBeCloseTo(height * 0.285);
        }
    });

    it('keeps warm paper and dark water when artwork changes', () => {
        const palette = riverPaletteFromPixels(Uint8ClampedArray.of(180, 25, 200, 255));
        expect(palette.haze).not.toBe(RIVER_PALETTE.haze);
        expect(palette.water).toBe(RIVER_PALETTE.water);
        expect(palette.paper).toBe(RIVER_PALETTE.paper);
        expect(riverPaletteFromPixels(Uint8ClampedArray.of(0, 0, 0, 0))).toBe(RIVER_PALETTE);
    });
});
