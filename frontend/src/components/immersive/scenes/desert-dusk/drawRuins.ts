import {sceneRandom} from '../shared/scenery';
import type {DesertPalette} from './palette';

export function drawRuins(ctx: CanvasRenderingContext2D, x: number, base: number, scale: number, seed: number, p: DesertPalette) {
    const random = (i: number) => sceneRandom(seed, i);
    const variant = Math.floor(random(1) * 3);
    ctx.save(); ctx.translate(x, base); ctx.scale(scale, scale);
    const pillar = (px: number, height: number, width: number) => {
        ctx.fillStyle = p.stoneShadow; ctx.fillRect(px - width / 2 + 7, -height + 4, width, height);
        ctx.fillStyle = p.stone;
        ctx.beginPath(); ctx.moveTo(px - width / 2, 0); ctx.lineTo(px - width / 2, -height + 7);
        ctx.lineTo(px - width / 2 + 5, -height); ctx.lineTo(px + width / 2 - 8, -height + 3);
        ctx.lineTo(px + width / 2, -height + 11); ctx.lineTo(px + width / 2, 0); ctx.fill();
        ctx.strokeStyle = p.stoneShadow; ctx.lineWidth = 1;
        for (let y = -height + 21; y < 0; y += 17) {
            ctx.beginPath(); ctx.moveTo(px - width / 2 + 1, y); ctx.lineTo(px + width / 2, y - 2); ctx.stroke();
        }
        ctx.fillStyle = '#e6bb8c55'; ctx.fillRect(px - width / 2 + 2, -height + 12, 2, height - 12);
        ctx.fillStyle = p.stoneShadow; ctx.fillRect(px - width / 2 - 5, -8, width + 17, 9);
    };
    if (variant === 2) {
        pillar(-63, 99 + random(2) * 26, 26);
        pillar(4, 150 + random(3) * 21, 31);
        pillar(64, 73 + random(4) * 29, 27);
        ctx.fillStyle = p.stone; ctx.fillRect(-19, -157, 50, 11);
    } else {
        const top = variant === 0 ? -158 : -114;
        const width = variant === 0 ? 75 : 100;
        const archTop = variant === 0 ? -97 : -69;
        const opening = variant === 0 ? 29 : 24;
        const outline = () => {
            ctx.beginPath(); ctx.moveTo(-width, 5); ctx.lineTo(-width, top + 41);
            ctx.lineTo(-width + 14, top + 39); ctx.lineTo(-width + 14, top + 8);
            ctx.lineTo(-width + 31, top + 8); ctx.lineTo(-width + 36, top);
            ctx.lineTo(16, top + 4); ctx.lineTo(24, top + 15); ctx.lineTo(width - 10, top + 13);
            ctx.lineTo(width - 10, top + 35); ctx.lineTo(width, top + 39); ctx.lineTo(width, 5); ctx.closePath();
            ctx.moveTo(-opening, 5); ctx.lineTo(-opening, archTop + 28);
            ctx.bezierCurveTo(-opening, archTop + 10, -12, archTop, 0, archTop - 4);
            ctx.bezierCurveTo(12, archTop, opening, archTop + 10, opening, archTop + 28);
            ctx.lineTo(opening, 5); ctx.closePath();
        };
        ctx.save(); ctx.translate(12, 2); outline(); ctx.fillStyle = p.stoneShadow; ctx.fill('evenodd'); ctx.restore();
        outline();
        const stone = ctx.createLinearGradient(-width, top, width, 0);
        stone.addColorStop(0, p.stone); stone.addColorStop(1, p.stoneShadow);
        ctx.fillStyle = stone; ctx.fill('evenodd');
        ctx.save(); ctx.clip('evenodd');
        ctx.lineWidth = 1; ctx.strokeStyle = '#4d3a3659';
        for (let row = 0; row < 12; row++) {
            const y = top + row * 17;
            ctx.beginPath(); ctx.moveTo(-width, y); ctx.lineTo(width + 2, y + 2); ctx.stroke();
            for (let bx = -width + (row % 2) * 18; bx < width; bx += 34) {
                ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + 1, y + 17); ctx.stroke();
            }
        }
        for (let i = 0; i < 65; i++) {
            ctx.fillStyle = i % 2 ? '#edc79930' : '#49333322';
            ctx.fillRect((random(i + 20) - 0.5) * width * 2, top + random(i + 100) * -top, 1 + random(i + 180) * 5, 1.5);
        }
        ctx.restore();
        ctx.strokeStyle = p.stone; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(-opening - 3, -6); ctx.lineTo(-opening - 3, archTop + 28);
        ctx.quadraticCurveTo(-opening - 3, archTop + 4, 0, archTop - 8);
        ctx.quadraticCurveTo(opening + 3, archTop + 4, opening + 3, archTop + 28);
        ctx.lineTo(opening + 3, -6); ctx.stroke();
        pillar(-width - 22, 35 + random(9) * 28, 21);
    }
    for (let i = 0; i < 7; i++) {
        const rx = (random(i + 300) - 0.5) * 242;
        const height = 6 + random(i + 320) * 10;
        ctx.fillStyle = i % 2 ? p.stoneShadow : p.stone;
        ctx.beginPath(); ctx.moveTo(rx - 10, 5); ctx.lineTo(rx - 7, -height);
        ctx.lineTo(rx + 7, -height + 3); ctx.lineTo(rx + 12, 5); ctx.fill();
    }
    ctx.restore();
}
