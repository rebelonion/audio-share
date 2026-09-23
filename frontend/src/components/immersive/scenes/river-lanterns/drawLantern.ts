import {sceneRandom} from '../shared/scenery';
import type {Lantern} from './riverLanterns';

function candleNoise(time: number, seed: number): number {
    const step = Math.floor(time);
    const fraction = time - step;
    const blend = fraction * fraction * (3 - 2 * fraction);
    return sceneRandom(seed, step) * (1 - blend) + sceneRandom(seed, step + 1) * blend;
}

export function candleLight(time: number, lantern: Lantern) {
    const seed = Math.floor(lantern.phase * 1000000);
    const slow = candleNoise(time * 1.7, seed);
    const flutter = candleNoise(time * 7.3, seed + 31);
    const draft = candleNoise(time * 0.8, seed + 97);
    return {
        intensity: 0.76 + slow * 0.14 + flutter * 0.1 - Math.pow(draft, 4) * 0.22,
        lean: (candleNoise(time * 3.1, seed + 173) - 0.5) * 0.14,
        lift: (flutter - 0.5) * 0.09,
    };
}

export function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, lantern: Lantern, paperColor: string, light: ReturnType<typeof candleLight>) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 0.45 + lantern.turn) * 0.035);
    const side = 0.15 + (Math.sin(time * 0.12 + lantern.turn) + 1) * 0.13;
    const alpha = ctx.globalAlpha;
    const glow = ctx.createRadialGradient(0, -size * 0.45, 0, 0, -size * 0.45, size * 1.7);
    glow.addColorStop(0, `rgba(255, 171, 80, ${0.2 * light.intensity})`);
    glow.addColorStop(0.4, `rgba(255, 148, 57, ${0.06 * light.intensity})`);
    glow.addColorStop(1, 'rgba(255, 148, 57, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-size * 1.7, -size * 2.15, size * 3.4, size * 3.4);
    ctx.fillStyle = '#2b211f';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.035, size * 0.7, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    const paper = ctx.createRadialGradient(size * (-0.12 + light.lean), size * (-0.3 + light.lift), size * 0.04, 0, -size * 0.4, size * (0.6 + light.intensity * 0.2));
    paper.addColorStop(0, '#fff1b6');
    paper.addColorStop(0.3, paperColor);
    paper.addColorStop(0.72, lantern.warmth > 0.5 ? '#e98a4e' : '#efaa60');
    paper.addColorStop(1, '#a95536');
    ctx.fillStyle = '#78402e';
    ctx.beginPath();
    ctx.moveTo(-size * 0.54, -size * 0.94);
    ctx.lineTo(size * (0.55 - side), -size * 0.84);
    ctx.lineTo(size * (0.48 - side), -size * 0.015);
    ctx.lineTo(-size * 0.46, -size * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha * light.intensity;
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#78402e';
    ctx.beginPath();
    ctx.moveTo(size * (0.55 - side), -size * 0.84);
    ctx.lineTo(size * 0.57, -size * 1.02);
    ctx.lineTo(size * 0.5, -size * 0.15);
    ctx.lineTo(size * (0.48 - side), -size * 0.015);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha * light.intensity;
    ctx.fillStyle = lantern.warmth > 0.5 ? '#c27748' : '#d08e53';
    ctx.fill();
    ctx.globalAlpha = alpha;
    // Open paper rim and the dim inner wall keep the lantern from reading as a solid cube.
    ctx.fillStyle = '#754b32';
    ctx.beginPath();
    ctx.moveTo(-size * 0.54, -size * 0.94);
    ctx.lineTo(-size * (0.54 - side), -size * 1.09);
    ctx.lineTo(size * 0.57, -size * 1.02);
    ctx.lineTo(size * (0.55 - side), -size * 0.84);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd994';
    ctx.lineWidth = Math.max(0.5, size * 0.018);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(112, 64, 36, 0.22)';
    ctx.lineWidth = Math.max(0.35, size * 0.007);
    for (let i = 1; i < 8; i++) {
        const px = -0.49 + i * (0.99 - side) / 8;
        ctx.beginPath();
        ctx.moveTo(size * px, -size * (0.91 - i * 0.01));
        ctx.lineTo(size * px * 0.87, -size * 0.07);
        ctx.stroke();
    }
    ctx.restore();
}
