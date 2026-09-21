import {SCENE_TRAVEL_DISTANCE, sceneRandom} from '../shared/scenery';
import type {SceneFrame} from '../types';
import type {UnderwaterDrift} from './underwaterDrift';
import type {UnderwaterPalette} from './palette';

function drawRay(ctx: CanvasRenderingContext2D, phase: number, p: UnderwaterPalette) {
    const stroke = Math.sin(phase * 0.65);
    const farTip = -39 - stroke * 8;
    const nearTip = 56 + stroke * 12;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = p.stoneShadow; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-31, 1);
    ctx.bezierCurveTo(-64, 4, -94, 14 + Math.sin(phase * 0.5) * 5, -129, 12 + Math.sin(phase * 0.5 + 1) * 6); ctx.stroke();

    const back = ctx.createLinearGradient(0, farTip, -8, nearTip);
    back.addColorStop(0, p.stoneShadow); back.addColorStop(0.45, p.stone);
    back.addColorStop(1, p.stoneShadow);
    ctx.fillStyle = back;
    ctx.beginPath(); ctx.moveTo(30, -11);
    ctx.bezierCurveTo(16, -15, 9, farTip + 8, -36, farTip);
    ctx.quadraticCurveTo(-22, farTip + 13, -24, -13);
    ctx.quadraticCurveTo(-25, -5, -36, 1);
    ctx.quadraticCurveTo(-24, 10, -27, 23);
    ctx.quadraticCurveTo(-31, nearTip - 10, -46, nearTip);
    ctx.bezierCurveTo(-8, nearTip - 7, 17, 24, 30, 12);
    ctx.quadraticCurveTo(36, 10, 40, 13);
    ctx.quadraticCurveTo(46, 11, 45, 6);
    ctx.lineTo(38, 7); ctx.quadraticCurveTo(40, 0, 38, -6);
    ctx.lineTo(44, -7); ctx.quadraticCurveTo(44, -13, 39, -13);
    ctx.quadraticCurveTo(34, -10, 30, -11); ctx.closePath(); ctx.fill();

    ctx.strokeStyle = p.sand; ctx.globalAlpha = 0.28; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-35, farTip + 1);
    ctx.bezierCurveTo(9, farTip + 9, 16, -14, 30, -11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(27, 13);
    ctx.bezierCurveTo(14, 26, -10, nearTip - 8, -44, nearTip - 1); ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.beginPath(); ctx.moveTo(26, 0); ctx.quadraticCurveTo(-1, -4, -28, 1); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = p.deep;
    for (const y of [-8, 8]) {
        ctx.beginPath(); ctx.ellipse(29, y, 1.5, 1, 0, 0, Math.PI * 2); ctx.fill();
    }
}

function drawTurtle(ctx: CanvasRenderingContext2D, phase: number, p: UnderwaterPalette) {
    const stroke = Math.sin(phase * 0.8);
    const flipper = (x: number, y: number, reach: number, spread: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(x + 6, y);
        ctx.bezierCurveTo(x + 5, y + spread * 0.4, x + reach * 0.55, y + spread * 0.85, x + reach, y + spread);
        ctx.quadraticCurveTo(x + reach * 0.65, y + spread * 0.38, x - 7, y);
        ctx.closePath(); ctx.fill();
    };
    flipper(19, -12, -19 - stroke * 5, -23 - stroke * 7, p.kelp);
    flipper(-25, -10, -18, -9 - stroke * 2, p.kelp);
    ctx.fillStyle = p.kelpLight;
    ctx.beginPath(); ctx.moveTo(25, -7); ctx.lineTo(41, -6);
    ctx.bezierCurveTo(50, -12, 60, -7, 60, 0); ctx.quadraticCurveTo(58, 9, 45, 7);
    ctx.lineTo(27, 8); ctx.fill();
    ctx.fillStyle = p.kelp;
    ctx.beginPath(); ctx.moveTo(-31, -3); ctx.lineTo(-47, 3); ctx.lineTo(-31, 5); ctx.fill();
    flipper(-25, 11, -20, 10 + stroke * 2, p.kelpLight);
    flipper(19, 13, -24 - stroke * 7, 31 + stroke * 9, p.kelpLight);
    ctx.fillStyle = p.kelp; ctx.strokeStyle = p.kelpLight; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-1, 0, 37, 23, 0.04, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.clip();
    const shell = ctx.createLinearGradient(0, -24, 0, 24);
    shell.addColorStop(0, p.kelpLight); shell.addColorStop(1, p.kelp);
    ctx.fillStyle = shell; ctx.fillRect(-40, -24, 80, 48);
    ctx.strokeStyle = p.groundShadow; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-12, -13); ctx.lineTo(9, -14); ctx.lineTo(21, -2);
    ctx.lineTo(10, 12); ctx.lineTo(-12, 12); ctx.lineTo(-23, -1); ctx.closePath(); ctx.stroke();
    for (const [x, y, ex, ey] of [[-12, -13, -20, -24], [9, -14, 20, -23], [21, -2, 38, -2], [10, 12, 21, 24], [-12, 12, -23, 24], [-23, -1, -39, 0]]) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = p.deep;
    ctx.beginPath(); ctx.arc(54, -3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.kelp; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(54, 4); ctx.lineTo(59, 3); ctx.stroke();
}

function drawReefFish(ctx: CanvasRenderingContext2D, phase: number, p: UnderwaterPalette) {
    for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(-i * 43, Math.sin(i * 2.1) * 25 + Math.sin(phase + i) * 3);
        const size = 1 - i * 0.14;
        ctx.scale(size, size);
        const tail = 7 + Math.sin(phase * 3 + i) * 1.5;
        ctx.fillStyle = p.coralShadow;
        ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(-23, -2); ctx.lineTo(-33, -tail);
        ctx.quadraticCurveTo(-29, 0, -33, tail); ctx.lineTo(-23, 2); ctx.lineTo(-16, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = p.sand;
        ctx.beginPath(); ctx.moveTo(13, -8);
        ctx.quadraticCurveTo(9, -18, 4, -19);
        ctx.quadraticCurveTo(-7, -18, -17, -5); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.strokeStyle = p.coralShadow; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.45;
        for (let ray = 0; ray < 4; ray++) {
            const x = -10 + ray * 5;
            ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x - 3, -14 - ray); ctx.stroke();
        }
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(4, 5);
        ctx.quadraticCurveTo(-5, 15, -17, 13); ctx.lineTo(-17, -1); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(11, 8); ctx.lineTo(3, 15); ctx.lineTo(4, 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = i % 2 ? p.stone : p.coral;
        ctx.beginPath(); ctx.moveTo(24, 0);
        ctx.bezierCurveTo(10, -20, -8, -19, -19, 0);
        ctx.bezierCurveTo(-7, 16, 12, 16, 24, 0); ctx.fill();
        ctx.save(); ctx.clip(); ctx.strokeStyle = p.coralShadow; ctx.lineWidth = 4;
        for (let stripe = 0; stripe < 3; stripe++) {
            const x = -10 + stripe * 10;
            ctx.beginPath(); ctx.moveTo(x, -16); ctx.quadraticCurveTo(x - 6, 0, x, 16); ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = p.deep;
        ctx.beginPath(); ctx.arc(16, -3, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.sand; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(7, 1);
        ctx.quadraticCurveTo(2, 2, -4 - Math.sin(phase * 2 + i) * 2, 8);
        ctx.quadraticCurveTo(3, 10, 7, 1); ctx.fill();
        ctx.restore();
    }
}

const SWIMMERS = [
    {draw: drawRay, seedOffset: 3200, spacing: 1300, speed: 12, origin: 0.25, heightRatio: 0.47},
    {draw: drawTurtle, seedOffset: 4200, spacing: 1700, speed: 8, origin: 0.78, heightRatio: 0.56},
    {draw: drawReefFish, seedOffset: 5200, spacing: 940, speed: 17, origin: 0.6, heightRatio: 0.35},
];

export function drawSwimmers(ctx: CanvasRenderingContext2D, scene: UnderwaterDrift, frame: SceneFrame<UnderwaterDrift>, scale: number, p: UnderwaterPalette) {
    const {width, height, travel, ambientTime: time, pointerX, pointerY} = frame;
    ctx.save(); ctx.translate(pointerX * 15, pointerY * 6);
    for (const swimmer of SWIMMERS) {
        const random = (i: number) => sceneRandom(scene.seed, i + swimmer.seedOffset);
        const direction = random(0) > 0.5 ? 1 : -1;
        const cell = swimmer.spacing * scale;
        const origin = width * swimmer.origin;
        const camera = travel * SCENE_TRAVEL_DISTANCE * 0.34 - time * swimmer.speed * scale * direction;
        for (let i = Math.floor((camera - origin) / cell) - 1; i <= Math.ceil((camera + width - origin) / cell); i++) {
            const x = i * cell + origin - camera;
            if (x < -180 * scale || x > width + 180 * scale) continue;
            const phase = time + random(i * 7 + 10) * Math.PI * 2;
            const y = height * (swimmer.heightRatio + (random(i * 7 + 20) - 0.5) * 0.08) + Math.sin(phase * 0.3) * 8 * scale;
            const size = (0.8 + random(i * 7 + 30) * 0.35) * scale;
            ctx.save(); ctx.translate(x, y); ctx.scale(size * direction, size);
            ctx.rotate(Math.sin(phase * 0.25) * 0.035);
            swimmer.draw(ctx, phase, p); ctx.restore();
        }
    }
    ctx.restore();
}
