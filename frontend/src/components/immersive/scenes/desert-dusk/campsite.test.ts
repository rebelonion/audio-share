import {expect, it} from 'vitest';
import {campsiteBaseY, createCampsite} from './campsite';
import {desertGroundY} from './desertDusk';

it('varies campsite silhouettes and restores each layout when revisited', () => {
    const seeds = Array.from({length: 60}, (_, i) => i * 47);
    const camps = seeds.map(createCampsite);
    expect(new Set(camps.map(camp => camp.tents.length))).toEqual(new Set([1, 2, 3]));
    expect(new Set(camps.flatMap(camp => camp.tents.map(tent => tent.facing)))).toEqual(new Set([-1, 1]));
    expect(new Set(camps.flatMap(camp => camp.tents.map(tent => tent.cloth))).size).toBe(3);
    expect(camps.some(camp => camp.tents.some(tent => tent.awning))).toBe(true);
    expect(seeds.reverse().map(createCampsite).reverse()).toEqual(camps);
});

it.each([390, 844, 900])('keeps the entire campsite below its dune crest at height %s', height => {
    const sceneScale = Math.min(1.4, Math.max(0.55, height / 850));
    for (let seed = 0; seed < 20; seed++) {
        const camp = createCampsite(seed);
        for (const world of [-2400, -600, 0, 750, 2200]) {
            const size = sceneScale * (seed % 2 ? 0.63 : 0.87);
            const base = campsiteBaseY(camp, world, height, sceneScale, size);
            const top = base + camp.bounds.top * size;
            for (let x = camp.bounds.left; x <= camp.bounds.right; x += 3) {
                expect(top).toBeGreaterThan(desertGroundY(world + x * size, height, sceneScale) + 7 * sceneScale);
            }
            for (const tent of camp.tents) {
                expect(tent.y + (tent.peak - 9) * tent.size).toBeGreaterThanOrEqual(camp.bounds.top);
                for (const edge of [-89, tent.awning ? 133 : 89]) {
                    const x = tent.x + edge * tent.size * tent.facing;
                    expect(x).toBeGreaterThan(camp.bounds.left);
                    expect(x).toBeLessThan(camp.bounds.right);
                }
            }
        }
    }
});
