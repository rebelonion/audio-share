import {expect, it} from 'vitest';
import {NIGHT_TRAIN_PALETTE, trainPaletteFromPixels} from './palette';

it('keeps the blue environment and warm lamps while artwork changes fabric and lighting', () => {
    const red = trainPaletteFromPixels(Uint8ClampedArray.of(255, 0, 0, 255));
    const blue = trainPaletteFromPixels(Uint8ClampedArray.of(0, 0, 255, 255));
    expect(red.accent).not.toBe(blue.accent);
    expect(red.light).not.toBe(blue.light);
    expect(red.upholstery).not.toBe(blue.upholstery);
    expect(red.upholsteryLight).not.toBe(blue.upholsteryLight);
    for (const palette of [red, blue]) {
        for (const key of ['midnight', 'sky', 'twilight', 'far', 'hill', 'forest', 'lake', 'lakeDeep', 'shore', 'carriage', 'amber'] as const) {
            expect(palette[key]).toBe(NIGHT_TRAIN_PALETTE[key]);
        }
    }
});

it('keeps the original night palette for empty, gray, or transparent artwork', () => {
    for (const pixels of [[], [120, 120, 120, 255], [255, 0, 0, 0]]) {
        expect(trainPaletteFromPixels(Uint8ClampedArray.from(pixels))).toEqual(NIGHT_TRAIN_PALETTE);
    }
});
