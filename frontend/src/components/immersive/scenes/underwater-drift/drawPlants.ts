import {sceneRandom} from '../shared/scenery';
import type {UnderwaterPalette} from './palette';

export function drawKelp(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seed: number, time: number, p: UnderwaterPalette, silhouette = false) {
    const random = (i: number) => sceneRandom(seed, i + 300);
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    const stems = 3 + Math.floor(random(0) * 3);
    for (let stem = 0; stem < stems; stem++) {
        const height = 150 + random(stem + 10) * 240;
        const lean = (random(stem + 20) - 0.5) * 110;
        const phase = random(stem + 30) * Math.PI * 2;
        const point = (t: number) => ({
            x: (stem - stems / 2) * 7 + lean * t * t + Math.sin(time * 0.38 + phase + t * 3) * 17 * t,
            y: -height * t,
        });
        ctx.fillStyle = silhouette ? p.near : stem % 2 ? p.kelp : p.kelpLight;
        ctx.beginPath();
        for (let j = 0; j <= 16; j++) {
            const t = j / 16, v = point(t);
            if (j === 0) ctx.moveTo(v.x - 2, v.y);
            else ctx.lineTo(v.x - (1 - t) * 2, v.y);
        }
        for (let j = 16; j >= 0; j--) {
            const t = j / 16, v = point(t);
            ctx.lineTo(v.x + (1 - t) * 2, v.y);
        }
        ctx.closePath(); ctx.fill();
        for (let leaf = 0; leaf < 10; leaf++) {
            const t = 0.13 + leaf * 0.079;
            const v = point(t);
            const direction = leaf % 2 ? 1 : -1;
            const reach = direction * (14 + random(stem * 30 + leaf + 60) * 19) * (1 - t * 0.3);
            const lift = 30 + random(stem * 30 + leaf + 90) * 36;
            const curl = Math.sin(time * 0.45 + phase + leaf * 0.7) * 5;
            ctx.beginPath(); ctx.moveTo(v.x, v.y);
            ctx.bezierCurveTo(v.x + reach * 0.5, v.y - 4, v.x + reach * 1.3, v.y - lift * 0.5, v.x + reach + curl, v.y - lift);
            ctx.bezierCurveTo(v.x + reach * 0.55, v.y - lift * 0.55, v.x + reach * 0.1, v.y - 14, v.x, v.y);
            ctx.fill();
            ctx.beginPath(); ctx.ellipse(v.x + direction * 2, v.y - 3, 1.8, 3, direction * 0.4, 0, Math.PI * 2); ctx.fill();
        }
        if (!silhouette) {
            ctx.strokeStyle = p.kelpLight; ctx.globalAlpha = 0.35; ctx.lineWidth = 0.7;
            ctx.beginPath();
            for (let j = 0; j <= 12; j++) {
                const v = point(j / 12);
                if (j === 0) ctx.moveTo(v.x, v.y); else ctx.lineTo(v.x, v.y);
            }
            ctx.stroke(); ctx.globalAlpha = 1;
        }
    }
    ctx.restore();
}

export function drawCoral(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seed: number, time: number, p: UnderwaterPalette) {
    const random = (i: number) => sceneRandom(seed, i + 700);
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.rotate(Math.sin(time * 0.3 + random(0) * 6) * 0.025);
    if (random(1) < 0.65) {
        ctx.lineCap = 'round';
        const branch = (bx: number, by: number, angle: number, length: number, depth: number, index: number) => {
            const ex = bx + Math.cos(angle) * length;
            const ey = by + Math.sin(angle) * length;
            ctx.strokeStyle = depth > 2 ? p.coralShadow : p.coral;
            ctx.lineWidth = depth * 0.72 + 0.4;
            ctx.beginPath(); ctx.moveTo(bx, by);
            ctx.quadraticCurveTo(bx, by - length * 0.6, ex, ey); ctx.stroke();
            if (depth > 0) {
                branch(ex, ey, angle - 0.32 - random(index) * 0.2, length * 0.71, depth - 1, index * 2 + 1);
                branch(ex, ey, angle + 0.32 + random(index + 1) * 0.2, length * 0.73, depth - 1, index * 2 + 2);
            } else {
                ctx.fillStyle = p.coral;
                ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, Math.PI * 2); ctx.fill();
            }
        };
        for (let i = 0; i < 3; i++) branch(0, 0, -Math.PI / 2 + (i - 1) * 0.52, 24 + random(i + 10) * 12, 4, i + 20);
    } else {
        for (let i = 0; i < 9; i++) {
            const cx = (random(i + 30) - 0.5) * 67;
            const top = -13 - random(i + 50) * 39;
            const radius = 4 + random(i + 70) * 5;
            ctx.fillStyle = i % 2 ? p.coralShadow : p.coral;
            ctx.beginPath(); ctx.moveTo(cx - radius, 1);
            ctx.quadraticCurveTo(cx - radius * 1.4, top * 0.5, cx - radius, top);
            ctx.lineTo(cx + radius, top); ctx.quadraticCurveTo(cx + radius * 1.4, top * 0.4, cx + radius, 1); ctx.fill();
            ctx.fillStyle = p.coral; ctx.beginPath(); ctx.ellipse(cx, top, radius, radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = p.coralShadow; ctx.beginPath(); ctx.ellipse(cx, top, radius * 0.66, radius * 0.22, 0, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();
}
