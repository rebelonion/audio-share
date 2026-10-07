import {clamp} from '@/lib/utils';
import type {TimeOfYear} from '@/lib/seasons';
import {sceneRandom} from '../shared/scenery';

/** What moves through the air each season: fireflies, falling leaves, or snow. Spring's petals fall from the trees themselves. */
export function drawSeasonalAir(
    ctx: CanvasRenderingContext2D, season: TimeOfYear, seed: number, time: number,
    width: number, height: number, scale: number, audioLevel: number, pointerX: number,
) {
    if (season === 'summer') drawFireflies(ctx, seed, time, width, height, scale, audioLevel, pointerX);
    else if (season === 'autumn') drawLeaves(ctx, seed, time, width, height, scale, pointerX);
    else if (season === 'winter') drawSnow(ctx, seed, time, width, height, scale, pointerX);
}

let fireflyGlow: HTMLCanvasElement | null = null;

// One soft glow, drawn once and reused at varying size and opacity for every firefly.
function fireflyGlowSprite(): HTMLCanvasElement {
    if (fireflyGlow) return fireflyGlow;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const brush = sprite.getContext('2d')!;
    const halo = brush.createRadialGradient(32, 32, 0, 32, 32, 32);
    halo.addColorStop(0, 'rgba(214, 255, 140, 0.55)');
    halo.addColorStop(1, 'rgba(214, 255, 140, 0)');
    brush.fillStyle = halo;
    brush.fillRect(0, 0, 64, 64);
    fireflyGlow = sprite;
    return sprite;
}

function drawFireflies(ctx: CanvasRenderingContext2D, seed: number, time: number, width: number, height: number, scale: number, audioLevel: number, pointerX: number) {
    const sprite = fireflyGlowSprite();
    const random = (index: number) => sceneRandom(seed, 5000 + index);
    const count = Math.round(clamp(width / 40, 14, 40));
    ctx.save();
    for (let i = 0; i < count; i++) {
        const speed = 0.02 + random(i * 9) * 0.03;
        const drift = (random(i * 9 + 1) + time * speed) % 1;
        const x = ((drift * (width + 80 * scale) - 40 * scale) + Math.sin(time * 0.7 + i * 1.3) * 14 * scale + pointerX * 6 + width) % width;
        const y = height * (0.6 + random(i * 9 + 2) * 0.32) + Math.sin(time * 0.5 + i) * 10 * scale;
        // Each firefly blinks on its own slow cycle; the music brightens the whole meadow.
        const blink = Math.pow(Math.max(0, Math.sin(time * (0.9 + random(i * 9 + 3) * 1.1) + i * 2.1)), 3);
        const glow = blink * (0.55 + audioLevel * 0.7);
        if (glow < 0.02) continue;
        const radius = (5 + random(i * 9 + 4) * 6) * scale;
        ctx.globalAlpha = glow;
        ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(244, 255, 200, ${glow})`;
        ctx.beginPath();
        ctx.arc(x, y, scale * 1.1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawLeaves(ctx: CanvasRenderingContext2D, seed: number, time: number, width: number, height: number, scale: number, pointerX: number) {
    const random = (index: number) => sceneRandom(seed, 6000 + index);
    const count = Math.round(clamp(width / 45, 12, 36));
    const colors = ['#c9501f', '#e0862f', '#f0b14a', '#9c3a1a'];
    ctx.save();
    for (let i = 0; i < count; i++) {
        const speed = 0.035 + random(i * 7) * 0.03;
        const age = (random(i * 7 + 1) + time * speed) % 1;
        const sway = Math.sin(time * 1.6 + i * 1.7) * 22 * scale;
        const x = ((random(i * 7 + 2) * width - age * 90 * scale + sway - pointerX * 8) % width + width) % width;
        const y = -12 * scale + age * (height + 24 * scale);
        const size = (4 + random(i * 7 + 3) * 4) * scale;
        const tumble = time * (1.5 + random(i * 7 + 4) * 2) + i;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tumble);
        ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.cos(tumble * 0.7));
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * (0.35 + 0.3 * Math.abs(Math.sin(tumble * 0.5))), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}

function drawSnow(ctx: CanvasRenderingContext2D, seed: number, time: number, width: number, height: number, scale: number, pointerX: number) {
    const random = (index: number) => sceneRandom(seed, 7000 + index);
    const count = Math.round(clamp(width / 9, 60, 180));
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < count; i++) {
        const depth = random(i * 5);
        const speed = 0.022 + depth * 0.035;
        const age = (random(i * 5 + 1) + time * speed) % 1;
        const sway = Math.sin(time * 0.8 + i) * (6 + depth * 10) * scale;
        const x = ((random(i * 5 + 2) * width + sway - pointerX * (3 + depth * 6)) % width + width) % width;
        const y = -6 * scale + age * (height + 12 * scale);
        ctx.globalAlpha = 0.25 + depth * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, (0.8 + depth * 1.7) * scale, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
