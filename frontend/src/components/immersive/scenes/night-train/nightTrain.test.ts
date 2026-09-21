import {describe, expect, it} from 'vitest';
import {createNightTrain, trainSeek} from './nightTrain';

describe('night train', () => {
    it('preserves quiet and loud waveform amplitudes in both terrain layers', () => {
        const quiet = createNightTrain('track', new Uint8Array(100));
        const loud = createNightTrain('track', new Uint8Array(100).fill(255));
        expect(quiet.seed).toBe(loud.seed);
        expect(quiet.hills).toEqual(Array(100).fill(0));
        expect(quiet.skyline).toEqual(Array(100).fill(0));
        expect(loud.hills).toEqual(Array(100).fill(1));
        expect(loud.skyline).toEqual(Array(100).fill(1));
    });

    it('provides repeatable scenery when peaks are missing, including after changing tracks', () => {
        const scene = createNightTrain('first', null);
        createNightTrain('second', null);
        expect(createNightTrain('first', new Uint8Array())).toEqual(scene);
        expect(createNightTrain('second', null)).not.toEqual(scene);
        expect(scene.hills.every(value => value === 0)).toBe(true);
        expect(scene.skyline.every(value => value === 0)).toBe(true);
    });

    it('seeks forward on a left drag and respects short recordings and endpoints', () => {
        expect(trainSeek(50, -500, 1000, 100)).toBe(70);
        expect(trainSeek(50, 500, 1000, 100)).toBe(30);
        expect(trainSeek(2, 1000, 1000, 5)).toBe(0);
        expect(trainSeek(2, -1000, 1000, 5)).toBe(5);
        expect(trainSeek(12, 100, 0, 100)).toBe(12);
        expect(trainSeek(12, 100, 1000, 0)).toBe(12);
    });
});
