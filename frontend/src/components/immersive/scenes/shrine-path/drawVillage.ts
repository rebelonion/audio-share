import {SCENE_TRAVEL_DISTANCE, sceneRandom} from '../shared/scenery';
import type {SceneFrame} from '../types';
import type {ShrinePath} from './shrinePath';
import {drawCherryTree} from './drawCherryTree';
import {drawPine} from './drawGarden';
import {ridgeBaseAt, SHRINE_RIDGES, type RidgeProfile} from './terrain';
import type {ShrinePalette} from './palette';

const HOUSE_FOOTING = {halfWidth: 81, height: 7};

export function drawVillage(ctx: CanvasRenderingContext2D, seed: number, frame: SceneFrame<ShrinePath>, terrain: RidgeProfile, s: number, p: ShrinePalette) {
    const {width: w, travel, pointerX, ambientTime: time} = frame;
    const random = (index: number) => sceneRandom(seed, index);
    const ridge = SHRINE_RIDGES[2];
    const cell = 160 * s;
    const camera = travel * SCENE_TRAVEL_DISTANCE * ridge.speed - w * 0.1;
    const first = Math.floor(camera / cell) - 1;
    const last = Math.ceil((camera + w) / cell) + 1;
    for (let i = first; i <= last; i++) {
        const x = (i + random(i + 390) * 0.35) * cell - camera + pointerX * ridge.parallaxX;
        const settlement = random(Math.floor(i / 3) + 1500);
        if (settlement < 0.3 && random(i + 405) < 0.45) continue;
        const treeX = x - 45 * s;
        const treeY = ridgeBaseAt(terrain, treeX, 5 * s) + 4 * s;
        if (random(i + 410) < 0.18) {
            drawCherryTree(ctx, treeX, treeY, 86 * s, seed + i, time, true);
        } else {
            drawPine(ctx, treeX, treeY, (75 + random(i + 400) * 35) * s, seed + i, p.forest, time);
        }
        if (settlement > 0.3 && random(i + 500) > 0.2) {
            const houseScale = (0.38 + random(i + 510) * 0.18) * s;
            const houseX = x + 15 * s;
            const houseY = ridgeBaseAt(terrain, houseX, HOUSE_FOOTING.halfWidth * houseScale) + HOUSE_FOOTING.height * houseScale + 3 * s;
            drawHouse(ctx, houseX, houseY, houseScale, p, random(i + 520) > 0.55);
        }
    }
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, base: number, scale: number, p: ShrinePalette, twoStoreys: boolean) {
    ctx.save(); ctx.translate(x, base); ctx.scale(scale, scale);
    const top = twoStoreys ? -124 : -78;
    ctx.fillStyle = p.stone;
    ctx.fillRect(-HOUSE_FOOTING.halfWidth, -HOUSE_FOOTING.height, HOUSE_FOOTING.halfWidth * 2, HOUSE_FOOTING.height);
    ctx.fillStyle = p.timber; ctx.fillRect(-76, top, 152, -top - HOUSE_FOOTING.height);
    if (twoStoreys) {
        ctx.fillStyle = '#a99e87'; ctx.fillRect(-72, top + 7, 144, 43);
        ctx.fillStyle = p.timber;
        for (let px = -72; px <= 72; px += 36) ctx.fillRect(px, top + 5, 4, 48);
    }
    const windows = (y: number, height: number) => {
        for (const wx of [-62, 26]) {
            ctx.fillStyle = '#c4b18b'; ctx.fillRect(wx, y, 36, height);
            ctx.fillStyle = p.timber;
            for (let bar = 0; bar < 5; bar++) ctx.fillRect(wx + bar * 8, y, 2, height);
            ctx.fillRect(wx, y + height * 0.5, 36, 2);
        }
    };
    windows(-57, 33);
    if (twoStoreys) windows(top + 15, 25);
    ctx.fillStyle = '#353e36'; ctx.fillRect(-17, -58, 34, 51);
    ctx.fillStyle = '#93866b'; ctx.fillRect(-14, -55, 12, 47);
    ctx.fillRect(2, -55, 12, 47);
    ctx.fillStyle = p.timber;
    for (let slat = -11; slat <= 11; slat += 6) ctx.fillRect(slat, -55, 2, 47);
    const roof = (eave: number, rise: number, width: number) => {
        ctx.fillStyle = p.roof;
        ctx.beginPath(); ctx.moveTo(-width, eave); ctx.lineTo(-width + 27, eave - rise);
        ctx.lineTo(width - 23, eave - rise); ctx.lineTo(width, eave); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = p.roofLight; ctx.lineWidth = 1;
        for (let tile = -width + 30; tile < width - 23; tile += 9) {
            ctx.beginPath(); ctx.moveTo(tile, eave - rise + 2); ctx.lineTo(tile * 1.18, eave - 3); ctx.stroke();
        }
        ctx.fillStyle = '#202f31'; ctx.fillRect(-width, eave - 2, width * 2, 5);
        ctx.fillStyle = p.roofLight; ctx.fillRect(-width + 27, eave - rise, width * 2 - 50, 2);
    };
    roof(top + 1, 32, 91);
    if (twoStoreys) roof(-67, 13, 85);
    ctx.fillStyle = '#70817b';
    for (let panel = 0; panel < 3; panel++) ctx.fillRect(-20 + panel * 14, -62, 12, 15);
    ctx.restore();
}
