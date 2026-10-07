import {sceneRandom} from '../shared/scenery';

const RED = '#d8382c';
const DEEP_RED = '#8f1d16';
const GOLD = '#f2c35b';

function lanternGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 96, 64, ${alpha})`);
    gradient.addColorStop(0.5, `rgba(255, 70, 40, ${alpha * 0.3})`);
    gradient.addColorStop(1, 'rgba(255, 70, 40, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** A red paper lantern hanging from (x, y); size is roughly its half-width. */
export function drawPaperLantern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, sway: number, intensity: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    lanternGlow(ctx, 0, size * 1.1, size * 2.6, 0.18 * intensity);
    ctx.strokeStyle = '#3a2520';
    ctx.lineWidth = Math.max(0.6, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size * 0.45);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.fillRect(-size * 0.3, size * 0.4, size * 0.6, size * 0.14);
    const body = ctx.createRadialGradient(-size * 0.25, size * 0.9, size * 0.1, 0, size * 1.1, size * 0.9);
    body.addColorStop(0, '#ff7a58');
    body.addColorStop(0.55, RED);
    body.addColorStop(1, DEEP_RED);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, size * 1.1, size * 0.72, size * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 120, 0.35)';
    ctx.lineWidth = Math.max(0.4, size * 0.04);
    for (const rib of [0.3, 0.65]) {
        ctx.beginPath();
        ctx.ellipse(0, size * 1.1, size * 0.72 * rib, size * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = GOLD;
    ctx.fillRect(-size * 0.3, size * 1.66, size * 0.6, size * 0.14);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(0.6, size * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, size * 1.8);
    ctx.lineTo(0, size * 2.35);
    ctx.stroke();
    ctx.restore();
}

/** A garland of lanterns strung along the carriage wall above the window, swaying with the ride. */
export function drawFestivalLanterns(
    ctx: CanvasRenderingContext2D, seed: number, time: number,
    width: number, top: number, scale: number, audioLevel: number, pointerX: number,
) {
    const count = Math.max(3, Math.round(width / (150 * scale)));
    const spacing = width / count;
    const y = top * 0.18;
    ctx.save();
    // The whole garland leans with the viewer, so the string runs past both edges.
    ctx.translate(-pointerX * 2, 0);
    ctx.strokeStyle = '#4a3328';
    ctx.lineWidth = Math.max(0.8, 1.2 * scale);
    ctx.beginPath();
    ctx.moveTo(-spacing, y);
    for (let i = 0; i <= count + 1; i++) {
        ctx.quadraticCurveTo((i - 0.5) * spacing, y + 8 * scale, i * spacing, y);
    }
    ctx.stroke();
    for (let i = -1; i <= count; i++) {
        const x = (i + 0.5) * spacing;
        const sway = Math.sin(time * 1.3 + i * 1.7) * 0.06;
        const size = (9 + sceneRandom(seed, 9000 + i) * 2) * scale;
        drawPaperLantern(ctx, x, y + 4 * scale, size, sway, 0.8 + audioLevel * 0.6);
    }
    ctx.restore();
}
