import {sceneRandom} from '../shared/scenery';
import {drawGardenRocks} from './drawGarden';
import type {ShrinePalette} from './palette';

export function drawPond(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seed: number, time: number, p: ShrinePalette) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    const random = (index: number) => sceneRandom(seed, index + 500);
    const width = 168 + random(1) * 48;
    const depth = 29 + random(2) * 9;
    const skew = (random(3) - 0.5) * 45;
    const hasBridge = random(4) > 0.38;
    ctx.beginPath(); ctx.moveTo(-width, 0);
    ctx.bezierCurveTo(-width, -depth * 0.65, -width * 0.55, -depth, skew, -depth);
    ctx.bezierCurveTo(width * 0.65, -depth, width, -depth * 0.55, width, 0);
    ctx.bezierCurveTo(width, depth * 0.6, width * 0.5, depth * 1.1, -skew, depth);
    ctx.bezierCurveTo(-width * 0.65, depth, -width, depth * 0.65, -width, 0);
    ctx.closePath();
    const water = ctx.createLinearGradient(0, -36, 0, 49);
    water.addColorStop(0, '#668584'); water.addColorStop(1, '#364f52');
    ctx.fillStyle = water; ctx.fill();
    ctx.strokeStyle = '#7c8570'; ctx.lineWidth = 4; ctx.stroke();
    ctx.save(); ctx.clip();
    for (let i = 0; i < 30; i++) {
        const px = (sceneRandom(seed, i + 60) - 0.5) * 440;
        const py = -26 + sceneRandom(seed, i + 120) * 74;
        const drift = Math.sin(time * 0.45 + i) * 3;
        ctx.globalAlpha = 0.12 + Math.sin(time * 0.6 + i) * 0.06;
        ctx.strokeStyle = p.horizon; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + drift, py); ctx.lineTo(px + drift + 9 + sceneRandom(seed, i) * 24, py); ctx.stroke();
    }
    if (!hasBridge) {
        ctx.globalAlpha = 1;
        for (let i = 0; i < 5; i++) {
            const lx = width * (0.3 + random(i + 20) * 0.38);
            const ly = (random(i + 30) - 0.5) * depth;
            ctx.fillStyle = '#6d8463';
            ctx.beginPath(); ctx.ellipse(lx, ly, 5 + random(i + 40) * 4, 2.5, 0, 0.2, Math.PI * 2 - 0.3);
            ctx.lineTo(lx, ly); ctx.fill();
        }
    }
    if (hasBridge) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#203738';
        ctx.beginPath(); ctx.ellipse(0, depth * 0.3, width, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    for (let i = 0; i < 2 + Math.floor(random(6) * 3); i++) {
        const angle = (0.12 + random(i + 70) * 0.8) * Math.PI;
        drawGardenRocks(ctx, Math.cos(angle) * width, Math.sin(angle) * depth + 2, 0.45 + random(i + 80) * 0.35, seed + i * 9, p);
    }
    if (hasBridge) drawBridge(ctx, width + 10, depth * 0.3, 16 + random(5) * 8, p);
    ctx.strokeStyle = '#829274'; ctx.lineWidth = 1.6;
    const reedSide = random(7) > 0.5 ? 1 : -1;
    for (let i = 0; i < 12; i++) {
        const rx = reedSide * width * (0.3 + random(i + 300) * 0.35);
        const ry = depth * Math.sqrt(1 - (rx / width) ** 2) + 3;
        ctx.beginPath(); ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(rx + 2, ry - 13, rx - 5 + Math.sin(time * 0.6 + i) * 2, ry - 13 - random(i + 340) * 12); ctx.stroke();
    }
    ctx.restore();
}

function drawBridge(ctx: CanvasRenderingContext2D, halfWidth: number, y: number, rise: number, p: ShrinePalette) {
    ctx.save(); ctx.translate(0, y);
    const arch = (offset: number) => {
        ctx.beginPath(); ctx.moveTo(-halfWidth, offset); ctx.quadraticCurveTo(0, offset - rise * 2, halfWidth, offset);
    };
    const railing = (side: number) => {
        ctx.strokeStyle = p.timber; ctx.lineWidth = 4;
        for (let post = 0; post <= 6; post++) {
            const bx = -halfWidth + post * halfWidth / 3;
            const lift = rise * (1 - (bx / halfWidth) ** 2);
            ctx.beginPath(); ctx.moveTo(bx, side - lift); ctx.lineTo(bx, side - lift - 24); ctx.stroke();
        }
        arch(side - 24); ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = '#b49a77'; ctx.lineWidth = 1; arch(side - 26); ctx.stroke();
    };
    for (const side of [-1, 1]) {
        const bankX = side * halfWidth;
        ctx.fillStyle = p.stone; ctx.fillRect(bankX - 12, -7, 24, 19);
        ctx.fillStyle = '#505e50'; ctx.fillRect(bankX - 12, 9, 24, 5);
    }
    railing(-5);
    arch(5); ctx.lineTo(halfWidth, 10); ctx.quadraticCurveTo(0, 10 - rise * 2, -halfWidth, 10); ctx.closePath();
    ctx.fillStyle = p.timber; ctx.fill();
    arch(-5); ctx.lineTo(halfWidth, 5); ctx.quadraticCurveTo(0, 5 - rise * 2, -halfWidth, 5); ctx.closePath();
    ctx.fillStyle = '#9b8064'; ctx.fill();
    ctx.strokeStyle = '#524b3e'; ctx.lineWidth = 1.5;
    for (let bx = -halfWidth + 8; bx < halfWidth; bx += 11) {
        const lift = rise * (1 - (bx / halfWidth) ** 2);
        ctx.beginPath(); ctx.moveTo(bx, -5 - lift); ctx.lineTo(bx, 5 - lift); ctx.stroke();
    }
    railing(6);
    ctx.restore();
}
