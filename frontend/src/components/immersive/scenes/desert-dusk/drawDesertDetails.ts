import {SCENE_TRAVEL_DISTANCE, sceneRandom} from '../shared/scenery';
import type {SceneFrame} from '../types';
import {DESERT_GROUND, desertGroundY, type DesertDusk} from './desertDusk';
import type {DesertPalette} from './palette';
import {drawCamp} from './drawCamp';
import {campsiteBaseY, createCampsite} from './campsite';

export function drawMesas(ctx: CanvasRenderingContext2D, seed: number, frame: SceneFrame<DesertDusk>, scale: number, p: DesertPalette) {
    const {width, height, travel, pointerX, pointerY} = frame;
    const cell = 620 * scale;
    const camera = travel * SCENE_TRAVEL_DISTANCE * 0.07;
    const random = (i: number) => sceneRandom(seed, i + 1800);
    ctx.save(); ctx.translate(pointerX * 2, pointerY);
    for (let i = Math.floor(camera / cell) - 1; i <= Math.ceil((camera + width) / cell); i++) {
        if (random(i * 9) < 0.22) continue;
        const x = (i + 0.5) * cell - camera;
        const span = (110 + random(i * 9 + 1) * 180) * scale;
        const top = height * 0.6 - (40 + random(i * 9 + 2) * 80) * scale;
        const bottom = height * 0.73;
        ctx.beginPath(); ctx.moveTo(x - span, height);
        ctx.lineTo(x - span, bottom); ctx.lineTo(x - span * 0.7, top + 44 * scale);
        ctx.lineTo(x - span * 0.56, top + 40 * scale); ctx.lineTo(x - span * 0.51, top + 4 * scale);
        ctx.lineTo(x - span * 0.15, top); ctx.lineTo(x + span * 0.11, top + 6 * scale);
        ctx.lineTo(x + span * 0.15, top + 25 * scale); ctx.lineTo(x + span * 0.37, top + 28 * scale);
        ctx.lineTo(x + span * 0.47, top + 68 * scale); ctx.lineTo(x + span * 0.64, top + 75 * scale);
        ctx.lineTo(x + span, bottom); ctx.lineTo(x + span, height); ctx.closePath();
        ctx.fillStyle = p.farShadow; ctx.globalAlpha = 0.42; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.strokeStyle = p.horizon; ctx.lineWidth = scale;
        for (let row = 0; row < 8; row++) {
            ctx.globalAlpha = 0.12;
            const y = top + (9 + row * 13) * scale;
            ctx.beginPath(); ctx.moveTo(x - span, y); ctx.lineTo(x + span, y + 5 * scale); ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}

function drawRocks(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seed: number, p: DesertPalette) {
    const random = (i: number) => sceneRandom(seed, i + 1900);
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = '#302b3433';
    ctx.beginPath(); ctx.ellipse(22, 3, 95, 8, 0, 0, Math.PI * 2); ctx.fill();
    const boulders = random(8) < 0.45;
    for (let i = 0; i < 3; i++) {
        const bx = i * 33 - 38 + random(i + 10) * 8;
        const height = boulders ? 13 + random(i) * 23 : 24 + random(i) * (i === 1 ? 100 : 50);
        const width = (boulders ? 27 : 20) + random(i + 5) * 13;
        ctx.fillStyle = p.stoneShadow;
        ctx.beginPath(); ctx.moveTo(bx - width, 2); ctx.lineTo(bx - width * 0.8, -height * 0.4);
        ctx.lineTo(bx - width * 0.55, -height * 0.45); ctx.lineTo(bx - width * 0.7, -height * 0.7);
        ctx.lineTo(bx - width * 0.35, -height); ctx.lineTo(bx + width * 0.55, -height + 2);
        ctx.lineTo(bx + width * 0.85, -height * 0.87); ctx.lineTo(bx + width * 0.45, -height * 0.63);
        ctx.lineTo(bx + width * 0.7, -height * 0.52); ctx.lineTo(bx + width * 0.68, -height * 0.25);
        ctx.lineTo(bx + width + 12, 2); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = p.stone;
        ctx.beginPath(); ctx.moveTo(bx - width, 2); ctx.lineTo(bx - width * 0.65, -height * 0.6);
        ctx.lineTo(bx - width * 0.45, -height); ctx.lineTo(bx + width * 0.18, -height + 2);
        ctx.lineTo(bx - width * 0.05, -height * 0.44); ctx.lineTo(bx + width * 0.2, 2); ctx.fill();
        ctx.strokeStyle = '#59413866'; ctx.lineWidth = 1;
        for (let row = 1; row < 5; row++) {
            const ry = -height * row / 5;
            ctx.beginPath(); ctx.moveTo(bx - width * 0.6, ry); ctx.lineTo(bx + width * 0.6, ry + 2); ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}

function drawScrub(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seed: number, time: number) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.strokeStyle = '#ac9270'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
        const spread = (sceneRandom(seed, i + 2000) - 0.5) * 32;
        const lift = 9 + sceneRandom(seed, i + 2020) * 15;
        ctx.beginPath(); ctx.moveTo(spread * 0.12, 0);
        ctx.quadraticCurveTo(spread * 0.5, -lift * 0.8, spread + Math.sin(time * 0.9 + i) * 1.1, -lift); ctx.stroke();
    }
    ctx.strokeStyle = '#594c44'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-9, 1); ctx.quadraticCurveTo(0, -3, 9, 1); ctx.stroke();
    ctx.restore();
}

export function drawGroundDetails(ctx: CanvasRenderingContext2D, seed: number, frame: SceneFrame<DesertDusk>, scale: number, p: DesertPalette) {
    const {width, height, travel, pointerX, pointerY, ambientTime: time} = frame;
    const camera = travel * SCENE_TRAVEL_DISTANCE * DESERT_GROUND.speed;
    const random = (i: number) => sceneRandom(seed, i + 2300);
    ctx.save(); ctx.translate(pointerX * DESERT_GROUND.parallaxX, pointerY * DESERT_GROUND.parallaxY);
    const patchCell = 105 * scale;
    for (let i = Math.floor(camera / patchCell) - 1; i <= Math.ceil((camera + width) / patchCell); i++) {
        const world = (i + random(i * 7) * 0.7) * patchCell;
        const x = world - camera;
        const y = desertGroundY(world, height, scale) + (26 + random(i * 7 + 1) * 70) * scale;
        if (random(i * 7 + 2) > 0.3) drawScrub(ctx, x, y, (0.35 + random(i * 7 + 3) * 0.45) * scale, seed + i * 13, time);
        ctx.fillStyle = '#4c39364d';
        for (let stone = 0; stone < 5; stone++) {
            const rx = x + (random(i * 17 + stone + 100) - 0.5) * 74 * scale;
            const ry = y + random(i * 17 + stone + 200) * 11 * scale;
            ctx.beginPath(); ctx.ellipse(rx, ry, (1 + random(i * 17 + stone + 300) * 3) * scale, 1.2 * scale, -0.2, 0, Math.PI * 2); ctx.fill();
        }
    }
    const landmarkCell = 620 * scale;
    for (let i = Math.floor((camera - width * 0.36) / landmarkCell) - 1; i <= Math.ceil((camera + width) / landmarkCell); i++) {
        const world = i * landmarkCell + width * 0.36;
        const x = world - camera;
        if (x < -180 * scale || x > width + 180 * scale) continue;
        const size = (0.63 + random(i + 400) * 0.24) * scale;
        if (i === 0 || random(i + 420) < 0.32) {
            const camp = createCampsite(seed + i * 47);
            drawCamp(ctx, x, campsiteBaseY(camp, world, height, scale, size), size, camp, time, p, frame.audioLevel ?? 0);
            continue;
        }
        let base = 0;
        for (let dx = -130 * size; dx <= 130 * size; dx += 8) base = Math.max(base, desertGroundY(world + dx, height, scale));
        base += 48 * scale;
        drawRocks(ctx, x, base, size, seed + i * 47, p);
    }
    ctx.restore();
}

export function drawForegroundDetails(ctx: CanvasRenderingContext2D, seed: number, width: number, camera: number, scale: number, time: number, groundY: (world: number) => number, p: DesertPalette) {
    const cell = 240 * scale;
    for (let i = Math.floor(camera / cell) - 1; i <= Math.ceil((camera + width) / cell); i++) {
        const world = (i + 0.3) * cell;
        const x = world - camera;
        const y = groundY(world) + 6 * scale;
        if (sceneRandom(seed, i + 2600) > 0.65) drawRocks(ctx, x, y, 0.45 * scale, seed + i * 71, {...p, stone: p.near, stoneShadow: p.nearShadow});
        else drawScrub(ctx, x, y, 0.8 * scale, seed + i * 71, time);
    }
}
