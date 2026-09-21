import {expect, it} from 'vitest';
import {landmarkAt} from './landmarks';

it('keeps landmarks stable when revisiting cells in either direction', () => {
    for (const seed of [1, 92, 428917]) {
        const indices = Array.from({length: 100}, (_, i) => i - 50);
        const journey = indices.map(index => landmarkAt(seed, index));
        expect(indices.reverse().map(index => landmarkAt(seed, index)).reverse()).toEqual(journey);
        expect(new Set(journey)).toEqual(new Set(['shrine', 'pond', 'grove']));
        expect(landmarkAt(seed, 0)).toBe('shrine');
        for (let i = 1; i < journey.length; i++) {
            expect(journey[i - 1] === 'shrine' && journey[i] === 'shrine').toBe(false);
        }
    }
});
