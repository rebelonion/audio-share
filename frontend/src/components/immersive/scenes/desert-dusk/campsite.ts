import {sceneRandom} from '../shared/scenery';
import {desertGroundY} from './desertDusk';

interface CampTent {
    x: number;
    y: number;
    size: number;
    peak: number;
    facing: number;
    cloth: number;
    striped: boolean;
    awning: boolean;
}

const TENT_LAYOUTS = [
    [[-25, -4, 1.02]],
    [[62, -12, 0.65], [-40, 0, 0.94]],
    [[-73, -18, 0.59], [61, -16, 0.64], [-9, 4, 0.81]],
];

export function createCampsite(seed: number) {
    const random = (i: number) => sceneRandom(seed, i + 2800);
    const variant = Math.floor(random(0) * TENT_LAYOUTS.length);
    const mirror = random(1) > 0.5 ? 1 : -1;
    const tents: CampTent[] = TENT_LAYOUTS[variant].map(([x, y, size], i) => ({
        x: (x + (random(i + 10) - 0.5) * 10) * mirror, y,
        size: size * (0.93 + random(i + 20) * 0.14),
        peak: -71 - random(i + 30) * 10,
        facing: mirror, cloth: Math.floor(random(i + 40) * 3),
        striped: random(i + 50) > 0.3, awning: variant === 0,
    }));
    const fire = {x: (variant === 0 ? -107 : variant === 1 ? 70 : 108) * mirror, y: 9 + random(2) * 9};
    const supplies = (variant === 0 ? [[88, 9, 7], [105, 12, 6]] : [[-115, 3, 6], [-99, 6, 8], [131, 0, 6]])
        .map(([x, y, radius]) => ({x: x * mirror, y, radius}));
    const bounds = {left: fire.x - 42, right: fire.x + 42, top: fire.y - 64};
    for (const tent of tents) {
        const left = tent.facing > 0 ? -89 : -(tent.awning ? 133 : 89);
        const right = tent.facing > 0 ? (tent.awning ? 133 : 89) : 89;
        bounds.left = Math.min(bounds.left, tent.x + left * tent.size);
        bounds.right = Math.max(bounds.right, tent.x + right * tent.size);
        bounds.top = Math.min(bounds.top, tent.y + (tent.peak - 9) * tent.size);
    }
    for (const jar of supplies) {
        bounds.left = Math.min(bounds.left, jar.x - jar.radius);
        bounds.right = Math.max(bounds.right, jar.x + jar.radius);
        bounds.top = Math.min(bounds.top, jar.y - jar.radius * 2.3);
    }
    bounds.left -= 10;
    bounds.right += 10;
    return {tents, fire, supplies, bounds};
}

export type Campsite = ReturnType<typeof createCampsite>;

export function campsiteBaseY(camp: Campsite, world: number, height: number, sceneScale: number, campScale: number): number {
    const left = world + camp.bounds.left * campScale;
    const right = world + camp.bounds.right * campScale;
    let crest = Math.max(desertGroundY(left, height, sceneScale), desertGroundY(right, height, sceneScale));
    for (let x = left; x < right; x += 5) crest = Math.max(crest, desertGroundY(x, height, sceneScale));
    return crest - camp.bounds.top * campScale + 8 * sceneScale;
}
