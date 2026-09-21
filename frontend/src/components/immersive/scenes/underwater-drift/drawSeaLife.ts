import {SCENE_TRAVEL_DISTANCE, sceneRandom} from '../shared/scenery';
import type {SceneFrame} from '../types';
import type {UnderwaterDrift} from './underwaterDrift';
import type {UnderwaterPalette} from './palette';
import {drawSwimmers} from './drawSwimmers';

function drawJellyfish(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number, p: UnderwaterPalette) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
    ctx.rotate(Math.sin(phase * 0.4) * 0.08);
    const pulse = Math.sin(phase);
    const radius = 27 + pulse * 2.5;
    const glow = ctx.createRadialGradient(0, -8, 2, 0, -8, 67);
    glow.addColorStop(0, '#a0e4d512'); glow.addColorStop(1, '#a0e4d500');
    ctx.fillStyle = glow; ctx.fillRect(-67, -75, 134, 134);
    ctx.strokeStyle = p.glow; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
        const root = (i - 4) * 5;
        const length = 39 + Math.sin(i * 2.3) * 12 + (i % 3) * 12;
        ctx.globalAlpha = i % 2 ? 0.35 : 0.19; ctx.lineWidth = i % 3 ? 0.8 : 2.4;
        ctx.beginPath(); ctx.moveTo(root, 3);
        ctx.bezierCurveTo(root - 12 + pulse * 5, length * 0.35, root + 13 + Math.sin(phase + i) * 7, length * 0.68, root + Math.sin(phase * 0.7 + i * 0.6) * 14, length);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.33;
    const bell = ctx.createLinearGradient(0, -32, 0, 8);
    bell.addColorStop(0, p.glow); bell.addColorStop(1, p.water);
    ctx.fillStyle = bell;
    ctx.beginPath(); ctx.moveTo(-radius, 4);
    ctx.bezierCurveTo(-radius, -40 - pulse * 3, radius, -40 - pulse * 3, radius, 4);
    ctx.quadraticCurveTo(0, 13, -radius, 4); ctx.fill();
    ctx.globalAlpha = 0.62; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-radius, 4);
    ctx.bezierCurveTo(-radius, -40 - pulse * 3, radius, -40 - pulse * 3, radius, 4); ctx.stroke();
    ctx.globalAlpha = 0.22; ctx.lineWidth = 0.7;
    for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, -26 - pulse * 2);
        ctx.quadraticCurveTo(side * 17, -20, side * 12, 7); ctx.stroke();
    }
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(-radius, 4);
    for (let i = 0; i < 6; i++) {
        const left = -radius + i * radius / 3;
        ctx.quadraticCurveTo(left + radius / 6, 10 + (i % 2) * 2, left + radius / 3, 4);
    }
    ctx.stroke(); ctx.restore();
}

export function drawSeaLife(ctx: CanvasRenderingContext2D, scene: UnderwaterDrift, frame: SceneFrame<UnderwaterDrift>, scale: number, p: UnderwaterPalette) {
    const {width, height, travel, ambientTime: time, pointerX, pointerY} = frame;
    const random = (i: number) => sceneRandom(scene.seed, i + 1400);
    const cell = 780 * scale;
    const camera = travel * SCENE_TRAVEL_DISTANCE * 0.24;
    const origin = width * 0.46;
    ctx.save(); ctx.translate(pointerX * 10, pointerY * 4);
    for (let i = Math.floor((camera - origin) / cell) - 1; i <= Math.ceil((camera + width - origin) / cell); i++) {
        const x = i * cell + origin - camera;
        const y = height * (0.26 + random(i * 7) * 0.25);
        const count = 2 + Math.floor(random(i * 7 + 1) * 3);
        for (let j = 0; j < count; j++) {
            const phase = time * 1.15 + random(i * 17 + j + 40) * 6;
            const size = (j === 0 ? 1.05 : 0.35 + random(i * 17 + j + 60) * 0.25) * scale;
            const jx = x + j * 67 * scale + Math.sin(time * 0.19 + i) * 13 * scale;
            if (jx < -75 * scale || jx > width + 75 * scale) continue;
            drawJellyfish(ctx, jx,
                y + j * 33 * scale + Math.sin(time * 0.28 + i * 2 + j) * 19 * scale, size, phase, p);
        }
    }
    ctx.restore();

    const schoolCell = 970 * scale;
    const schoolCamera = travel * SCENE_TRAVEL_DISTANCE * 0.17 - time * 7 * scale;
    ctx.save(); ctx.translate(pointerX * 5, pointerY * 2);
    ctx.fillStyle = p.deep; ctx.globalAlpha = 0.45;
    for (let i = Math.floor(schoolCamera / schoolCell) - 1; i <= Math.ceil((schoolCamera + width) / schoolCell); i++) {
        const center = (i + 0.3) * schoolCell - schoolCamera;
        if (center < -150 * scale || center > width + 150 * scale) continue;
        const y = height * (0.36 + random(i + 180) * 0.29);
        const count = 9 + Math.floor(random(i + 190) * 10);
        for (let j = 0; j < count; j++) {
            const fx = center + (random(i * 31 + j + 210) - 0.5) * 260 * scale;
            const fy = y + (random(i * 31 + j + 250) - 0.5) * 68 * scale + Math.sin(time * 0.7 + j) * 3 * scale;
            const size = (0.45 + random(i * 31 + j + 290) * 0.55) * scale;
            const tail = 2.5 + Math.sin(time * 4 + j);
            ctx.save(); ctx.translate(fx, fy); ctx.scale(size, size);
            ctx.beginPath(); ctx.moveTo(9, 0);
            ctx.quadraticCurveTo(0, -5, -6, -1); ctx.lineTo(-11, -tail);
            ctx.lineTo(-10, tail); ctx.lineTo(-6, 1); ctx.quadraticCurveTo(0, 5, 9, 0); ctx.fill();
            ctx.restore();
        }
    }
    ctx.restore();
    drawSwimmers(ctx, scene, frame, scale, p);
}
