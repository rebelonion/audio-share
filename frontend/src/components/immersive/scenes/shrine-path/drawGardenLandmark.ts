import {sceneRandom} from '../shared/scenery';
import {drawStoneLantern} from './drawArchitecture';
import {drawGardenRocks, drawPine} from './drawGarden';
import {drawCherryTree} from './drawCherryTree';
import {drawPond} from './drawPond';
import type {ShrinePalette} from './palette';

export function drawGardenLandmark(ctx: CanvasRenderingContext2D, kind: 'pond' | 'grove', x: number, rearX: number, rearY: number, groundY: number, scale: number, seed: number, time: number, p: ShrinePalette) {
    const random = (index: number) => sceneRandom(seed, index + 1000);
    const count = 2 + Math.floor(random(1) * (kind === 'pond' ? 2 : 4));
    const spread = 280 + random(2) * 85;
    const blossomChance = 0.2 + random(3) * 0.6;
    for (let i = 0; i < count; i++) {
        const tx = rearX + ((i / (count - 1) - 0.5) * spread + (random(i + 10) - 0.5) * 30) * scale;
        const ty = rearY + (i * 4 + random(i + 20) * 5) * scale;
        const height = (115 + random(i + 30) * 90) * scale;
        if (random(i + 40) < blossomChance) {
            drawCherryTree(ctx, tx, ty, height, seed + i * 23, time);
        } else {
            drawPine(ctx, tx, ty, height, seed + i * 23, i % 2 ? p.pine : p.forest, time);
        }
    }
    if (kind === 'pond') {
        drawPond(ctx, x, groundY, scale, seed, time, p);
    } else {
        const groups = 1 + Math.floor(random(4) * 3);
        for (let i = 0; i < groups; i++) {
            const rx = x + ((i - (groups - 1) / 2) * 130 + (random(i + 50) - 0.5) * 50) * scale;
            drawGardenRocks(ctx, rx, groundY + random(i + 60) * 16 * scale, (0.7 + random(i + 70) * 0.8) * scale, seed + i * 31, p);
        }
    }
    if (random(5) > 0.4) {
        const side = random(6) > 0.5 ? 1 : -1;
        drawStoneLantern(ctx, x + side * 245 * scale, groundY + 12 * scale, (0.55 + random(7) * 0.2) * scale, p);
    }
}
