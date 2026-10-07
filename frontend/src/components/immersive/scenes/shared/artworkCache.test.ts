import {expect, it} from 'vitest';
import {ArtworkCache} from './artworkCache';

it('keeps everything a frame used, however many entries that is', () => {
    const cache = new ArtworkCache<number>(1000);
    for (let frame = 0; frame < 3; frame++) {
        for (let tree = 0; tree < 40; tree++) {
            const key = `tree-${tree}`;
            if (cache.get(key, frame * 16) === undefined) {
                expect(frame, `tree ${tree} was redrawn on frame ${frame}`).toBe(0);
                cache.set(key, tree, frame * 16);
            }
        }
    }
    expect(cache.size).toBe(40);
});

it('sweeps entries that have scrolled out of use', () => {
    const cache = new ArtworkCache<number>(1000);
    cache.set('old', 1, 0);
    cache.set('kept', 2, 0);
    cache.get('kept', 900);
    cache.set('new', 3, 1500);
    expect(cache.get('old', 1500)).toBeUndefined();
    expect(cache.get('kept', 1500)).toBe(2);
    expect(cache.get('new', 1500)).toBe(3);
});
