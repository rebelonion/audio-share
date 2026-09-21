import {clamp} from '@/lib/utils';
import {sceneRandom} from '../shared/scenery';

export function drawRain(
    ctx: CanvasRenderingContext2D, seed: number, time: number,
    width: number, top: number, bottom: number, scale: number, pointerX: number,
) {
    const random = (index: number) => sceneRandom(seed, 8000 + index);
    const height = bottom - top;
    const count = Math.round(clamp(width / 25, 22, 80));
    // Fine rain beyond the glass is carried backwards by the train's slipstream.
    for (let i = 0; i < count; i++) {
        const speed = 0.16 + random(i * 7) * 0.14;
        const age = (random(i * 7 + 1) + time * speed) % 1;
        const x = ((random(i * 7 + 2) * (width + height) - age * height) % (width + height) + width + height) % (width + height);
        const y = top + age * height;
        const length = (10 + random(i * 7 + 3) * 18) * scale;
        ctx.strokeStyle = `rgba(165, 191, 205, ${0.025 + random(i * 7 + 4) * 0.045})`;
        ctx.lineWidth = scale * 0.65;
        ctx.beginPath();
        ctx.moveTo(x + length, y - length);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    // Beads on the pane slide more slowly, leaving a curved, tapering trail.
    for (let i = 0; i < Math.ceil(count * 0.7); i++) {
        const drift = random(1000 + i * 5);
        const age = (random(1001 + i * 5) + time * (0.024 + drift * 0.045)) % 1;
        const wind = (35 + drift * 90) * scale;
        const origin = random(1002 + i * 5) * (width + wind);
        const x = origin - age * wind + Math.sin(age * 12 + i) * 2 * scale - pointerX * 3;
        const y = top + age * height;
        const length = (9 + drift * 30) * scale;
        const fade = Math.min(1, age * 12, (1 - age) * 12);
        const tailX = x + length * wind / height;
        const trail = ctx.createLinearGradient(tailX, y - length, x, y);
        trail.addColorStop(0, 'rgba(177, 204, 217, 0)');
        trail.addColorStop(1, `rgba(177, 204, 217, ${fade * (0.1 + drift * 0.12)})`);
        ctx.strokeStyle = trail;
        ctx.lineWidth = (0.6 + drift * 0.6) * scale;
        ctx.beginPath();
        ctx.moveTo(tailX, y - length);
        ctx.bezierCurveTo(tailX - 2 * scale, y - length * 0.7, x + scale, y - length * 0.2, x, y);
        ctx.stroke();
        const size = (0.7 + drift * 0.8) * scale;
        ctx.fillStyle = `rgba(10, 25, 38, ${fade * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * 1.6, 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(199, 218, 225, ${fade * 0.32})`;
        ctx.lineWidth = scale * 0.6;
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * 1.6, 0.12, -0.6, Math.PI * 0.65);
        ctx.stroke();
    }
}
