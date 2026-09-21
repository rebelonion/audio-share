import {sceneRandom} from '../shared/scenery';
import {desertGroundY} from './desertDusk';
import type {DesertPalette} from './palette';

export function drawCaravan(ctx: CanvasRenderingContext2D, world: number, camera: number, height: number, scale: number, seed: number, time: number, p: DesertPalette) {
    const count = 3 + Math.floor(sceneRandom(seed, 5) * 3);
    const camelScale = scale * 0.55;
    for (let i = 0; i < count; i++) {
        const position = world + i * 51 * scale + time * 2 * scale;
        const y = desertGroundY(position, height, scale) + 2 * scale;
        ctx.save(); ctx.translate(position - camera, y); ctx.scale(camelScale, camelScale);
        ctx.fillStyle = p.silhouette; ctx.strokeStyle = p.silhouette;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let leg = 0; leg < 4; leg++) {
            const hip = leg < 2 ? -15 : 13;
            const stride = Math.sin(time * 1.25 + i * 1.7 + leg * Math.PI * 0.85) * 4;
            ctx.lineWidth = leg % 2 ? 2 : 2.8;
            ctx.beginPath(); ctx.moveTo(hip, -20); ctx.lineTo(hip + stride * 0.4, -9);
            ctx.lineTo(hip + stride, -1); ctx.lineTo(hip + stride + 3, -1); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(-23, -21);
        ctx.bezierCurveTo(-28, -32, -19, -34, -11, -32);
        ctx.bezierCurveTo(-8, -51, 2, -47, 8, -32);
        ctx.bezierCurveTo(14, -30, 17, -29, 19, -35);
        ctx.lineTo(24, -52); ctx.quadraticCurveTo(26, -58, 30, -56);
        ctx.lineTo(38, -52); ctx.lineTo(38, -48); ctx.lineTo(29, -48);
        ctx.lineTo(27, -28); ctx.quadraticCurveTo(23, -16, 11, -18);
        ctx.quadraticCurveTo(-6, -13, -23, -21); ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-24, -28); ctx.quadraticCurveTo(-31, -24, -28, -15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(27, -54); ctx.lineTo(26, -60); ctx.stroke();
        ctx.fillStyle = '#b2856b'; ctx.fillRect(-13, -32, 18, 5);
        ctx.fillStyle = p.silhouette; ctx.fillRect(-10, -38, 13, 6);
        ctx.restore();
    }
}
