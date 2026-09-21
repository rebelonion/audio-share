import {SCENE_TRAVEL_DISTANCE, sceneRandom} from '../shared/scenery';
import type {SceneFrame} from '../types';
import {REEF, seabedY, type UnderwaterDrift} from './underwaterDrift';
import type {UnderwaterPalette} from './palette';
import {drawCoral, drawKelp} from './drawPlants';

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number, p: UnderwaterPalette) {
    const height = 14 + sceneRandom(seed, 0) * 32;
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    ctx.fillStyle = p.stoneShadow;
    ctx.beginPath(); ctx.moveTo(-43, 4);
    ctx.bezierCurveTo(-48, -height * 0.4, -27, -height, -13, -height);
    ctx.bezierCurveTo(5, -height - 5, 31, -height * 0.7, 37, -height * 0.23);
    ctx.lineTo(45, 6); ctx.quadraticCurveTo(0, 13, -43, 4); ctx.fill();
    ctx.fillStyle = p.stone;
    ctx.beginPath(); ctx.moveTo(-41, -3); ctx.quadraticCurveTo(-32, -height, -13, -height);
    ctx.quadraticCurveTo(7, -height - 3, 27, -height * 0.6);
    ctx.lineTo(5, -height * 0.57); ctx.lineTo(-11, -height * 0.75); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = p.groundShadow; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(5, -height * 0.57); ctx.lineTo(-2, -height * 0.32); ctx.lineTo(6, -4); ctx.stroke();
    ctx.restore();
}

function drawRuins(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number, p: UnderwaterPalette) {
    const random = (i: number) => sceneRandom(seed, i + 900);
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    const arch = random(0) > 0.42;
    const pillar = (px: number, top: number, width: number) => {
        ctx.fillStyle = p.stoneShadow; ctx.fillRect(px - width / 2, top, width, -top);
        ctx.fillStyle = p.stone; ctx.fillRect(px - width / 2, top, width * 0.62, -top);
        ctx.fillStyle = p.groundShadow;
        for (let i = 0; i < 3; i++) ctx.fillRect(px - width * 0.28 + i * width * 0.22, top + 10, 2, -top - 14);
        ctx.fillStyle = p.stoneShadow; ctx.fillRect(px - width / 2 - 5, top - 4, width + 10, 10);
        ctx.fillStyle = p.stone; ctx.fillRect(px - width / 2 - 7, -9, width + 14, 10);
        ctx.fillStyle = p.kelp; ctx.fillRect(px - width / 2 - 5, top - 5, width + 8, 3);
    };
    if (arch) {
        pillar(-61, -97, 29); pillar(61, -97, 29);
        ctx.fillStyle = p.stoneShadow;
        ctx.beginPath(); ctx.arc(0, -96, 77, Math.PI, 0);
        ctx.arc(0, -96, 47, 0, Math.PI, true); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = p.stone; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, -96, 74, Math.PI + 0.06, Math.PI * 1.91); ctx.stroke();
        ctx.strokeStyle = p.groundShadow; ctx.lineWidth = 2;
        for (let i = 1; i < 9; i++) {
            const angle = Math.PI + i * Math.PI / 9;
            ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 48, -96 + Math.sin(angle) * 48);
            ctx.lineTo(Math.cos(angle) * 74, -96 + Math.sin(angle) * 74); ctx.stroke();
        }
        ctx.strokeStyle = p.kelp; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, -96, 78, Math.PI * 1.12, Math.PI * 1.43); ctx.stroke();
    } else {
        pillar(-64, -88 - random(2) * 35, 31);
        pillar(6, -133 - random(3) * 21, 36);
        pillar(75, -51, 28);
        ctx.save(); ctx.translate(46, -12); ctx.rotate(-0.16);
        ctx.fillStyle = p.stoneShadow; ctx.fillRect(-45, -19, 90, 22);
        ctx.fillStyle = p.stone; ctx.fillRect(-45, -19, 90, 5); ctx.restore();
    }
    ctx.globalAlpha = 0.35; ctx.fillStyle = p.kelpLight;
    for (let i = 0; i < 22; i++) {
        const side = i % 2 ? -61 : 61;
        ctx.beginPath(); ctx.ellipse(side + (random(i + 20) - 0.5) * 24, -random(i + 50) * 88, 1 + random(i + 80) * 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

export function drawReef(ctx: CanvasRenderingContext2D, scene: UnderwaterDrift, frame: SceneFrame<UnderwaterDrift>, scale: number, p: UnderwaterPalette) {
    const {width, height, travel, pointerX, pointerY, ambientTime: time} = frame;
    const camera = travel * SCENE_TRAVEL_DISTANCE * REEF.speed;
    const random = (i: number) => sceneRandom(scene.seed, i + 2200);
    ctx.save(); ctx.translate(pointerX * REEF.parallaxX, pointerY * REEF.parallaxY);
    const ground = ctx.createLinearGradient(0, height * 0.8, 0, height);
    ground.addColorStop(0, p.ground); ground.addColorStop(1, p.groundShadow);
    ctx.beginPath(); ctx.moveTo(-100 * scale, height + 30);
    for (let x = -100 * scale; x <= width + 110 * scale; x += 7) ctx.lineTo(x, seabedY(x + camera, height, scale));
    ctx.lineTo(width + 110 * scale, height + 30); ctx.closePath(); ctx.fillStyle = ground; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = p.sand; ctx.lineWidth = 0.7 * scale;
    const rippleCell = 61 * scale;
    for (let i = Math.floor(camera / rippleCell) - 1; i <= Math.ceil((camera + width) / rippleCell); i++) {
        const world = i * rippleCell;
        const x = world - camera;
        for (let row = 0; row < 4; row++) {
            const y = seabedY(world, height, scale) + (13 + row * 17) * scale;
            ctx.globalAlpha = 0.1 + Math.sin(time * 0.4 + i + row) * 0.035;
            ctx.beginPath(); ctx.ellipse(x + row * 9 * scale, y, (19 + random(i + row) * 22) * scale, 3 * scale, -0.1, 0.15, Math.PI * 1.7); ctx.stroke();
        }
    }
    ctx.restore();

    const ruinCell = 920 * scale;
    for (let i = Math.floor(camera / ruinCell) - 1; i <= Math.ceil((camera + width) / ruinCell); i++) {
        if (random(i + 100) < 0.3) continue;
        const world = (i + 0.68) * ruinCell;
        const x = world - camera;
        if (x < -150 * scale || x > width + 150 * scale) continue;
        const size = (0.85 + random(i + 110) * 0.25) * scale;
        let base = 0;
        for (let dx = -105 * size; dx <= 105 * size; dx += 5) base = Math.max(base, seabedY(world + dx, height, scale));
        drawRuins(ctx, x, base + 6 * scale, size, scene.seed + i * 39, p);
        for (let rock = 0; rock < 4; rock++) {
            const rx = world + (rock - 1.5) * 58 * size;
            drawRock(ctx, rx - camera, seabedY(rx, height, scale) + 10 * scale, size * 0.55, scene.seed + i + rock, p);
        }
    }
    const plantCell = 215 * scale;
    for (let i = Math.floor(camera / plantCell) - 1; i <= Math.ceil((camera + width) / plantCell); i++) {
        const world = (i + random(i * 9 + 150) * 0.5) * plantCell;
        const x = world - camera;
        if (x < -180 * scale || x > width + 120 * scale) continue;
        const y = seabedY(world, height, scale) + 16 * scale;
        const seed = scene.seed + i * 57;
        if (random(i * 9 + 160) > 0.35) drawKelp(ctx, x, y, (0.5 + random(i * 9 + 170) * 0.43) * scale, seed, time, p);
        drawRock(ctx, x, y + 3 * scale, scale * 0.55, seed, p);
        drawCoral(ctx, x + 52 * scale, y + 13 * scale, (0.65 + random(i * 9 + 180) * 0.55) * scale, seed, time, p);
    }
    ctx.restore();

    const nearCamera = travel * SCENE_TRAVEL_DISTANCE * 0.76;
    const nearCell = 500 * scale;
    ctx.save(); ctx.translate(pointerX * 29, pointerY * 12);
    ctx.fillStyle = p.near;
    ctx.beginPath(); ctx.moveTo(-100, height + 30);
    for (let x = -100; x <= width + 110; x += 10) {
        ctx.lineTo(x, height * 1.01 + Math.sin((x + nearCamera) / (180 * scale)) * 18 * scale);
    }
    ctx.lineTo(width + 110, height + 30); ctx.fill();
    for (let i = Math.floor(nearCamera / nearCell) - 1; i <= Math.ceil((nearCamera + width) / nearCell); i++) {
        const x = (i + 0.12 + random(i + 500) * 0.2) * nearCell - nearCamera;
        if (x < -180 * scale || x > width + 180 * scale) continue;
        drawKelp(ctx, x, height + 40 * scale, (0.9 + random(i + 510) * 0.45) * scale, scene.seed + i * 77, time, p, true);
    }
    ctx.restore();
}
