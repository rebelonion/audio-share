import {sceneRandom} from '../shared/scenery';
import type {RIVER_PALETTE} from './riverLanterns';

// Shared wave field keeps the sky and lantern reflections on the same surface.
export function waterWave(x: number, depth: number, time: number): number {
    return Math.sin(x * 0.012 + depth * 29 - time * 0.52)
        + Math.sin(x * 0.027 - depth * 43 + time * 0.34) * 0.48
        + Math.sin(x * 0.061 + depth * 81 - time * 0.79) * 0.19;
}

export function drawWater(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, seed: number, palette: typeof RIVER_PALETTE) {
    const horizon = height * 0.28;
    const water = ctx.createLinearGradient(0, horizon, 0, height);
    water.addColorStop(0, palette.haze);
    water.addColorStop(0.12, palette.water);
    water.addColorStop(0.65, '#102331');
    water.addColorStop(1, palette.deep);
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, width, height - horizon);

    // Batch each depth row so fine water detail does not require thousands of strokes.
    for (let row = 0; row < 140; row++) {
        const depth = Math.pow(row / 139, 1.75);
        const y = horizon + depth * (height - horizon);
        const waveSize = 1 + depth * 2.8;
        const step = 9 + depth * 68;
        ctx.globalAlpha = 0.07 * (1 - depth * 0.5);
        ctx.strokeStyle = '#a4bec5';
        ctx.lineWidth = waveSize * 0.55;
        ctx.beginPath();
        for (let col = -1; col < width / step + 1; col++) {
            const random = sceneRandom(seed + row, col + 300);
            const x = col * step + random * step * 0.8;
            const wave = waterWave(x, depth, time);
            const crest = Math.max(0.05, wave * 0.5 + 0.25);
            ctx.moveTo(x, y + wave * waveSize);
            ctx.quadraticCurveTo(x + step * 0.24 * crest, y + wave * waveSize - waveSize,
                x + step * (0.35 + random * 0.5) * crest, y + wave * waveSize);
        }
        ctx.stroke();
        if (depth > 0.1) {
            ctx.globalAlpha = 0.11;
            ctx.strokeStyle = '#030a13';
            ctx.beginPath();
            for (let col = -1; col < width / step + 1; col++) {
                const x = col * step;
                const wave = waterWave(x, depth, time);
                ctx.moveTo(x - step * 0.3, y + waveSize * (2 + wave));
                ctx.quadraticCurveTo(x + step * 0.3, y + waveSize * (3.5 + wave), x + step, y + waveSize * (2 + wave));
            }
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
}

export function drawReflection(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, depth: number, time: number, phase: number, warmth: number, shimmer: number, height: number) {
    const length = size * (4.5 + depth * 2);
    const pool = ctx.createRadialGradient(x, y + size * 0.25, 0, x, y + size * 0.25, size * 2.2);
    pool.addColorStop(0, 'rgba(255, 155, 61, 0.13)');
    pool.addColorStop(0.45, 'rgba(219, 111, 42, 0.05)');
    pool.addColorStop(1, 'rgba(219, 111, 42, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(x - size * 2.2, y - size * 1.95, size * 4.4, size * 4.4);

    const alpha = ctx.globalAlpha;
    const rows = Math.min(115, Math.ceil(length / 1.6));
    const ribbons = Array.from({length: 8}, () => ({edge: new Path2D(), core: new Path2D()}));
    for (let row = 0; row < rows; row++) {
        const p = row / rows;
        const ry = y + 1 + p * length + Math.sin(row * 1.73 + time * 0.4) * size * 0.018;
        if (ry > height) break;
        const wave = waterWave(x + phase * 9, depth + p * 0.23, time);
        const fine = Math.sin(row * 2.37 + phase + time * 0.65)
            * Math.sin(row * 0.83 - time * 0.9 + phase);
        const gap = Math.max(0, fine * 0.65 + wave * 0.23 + 0.3);
        const envelope = Math.pow(1 - p, 1.8);
        const spread = size * (0.48 + Math.sin(p * Math.PI) * 0.65) * (0.45 + gap);
        const center = x + wave * size * (0.08 + p * 0.38);
        const thickness = Math.max(0.65, size * (0.018 + p * 0.05));
        const strength = Math.min(0.99, envelope * gap * (0.6 + shimmer * 0.14));
        if (strength < 0.025) continue;
        const ribbon = ribbons[Math.floor(strength * 8)];
        ribbon.edge.moveTo(center - spread, ry);
        ribbon.edge.quadraticCurveTo(center, ry - thickness * wave, center + spread * 0.85, ry + thickness * 0.3);
        ribbon.core.moveTo(center - spread * 0.24, ry);
        ribbon.core.lineTo(center + spread * (0.12 + gap * 0.25), ry);
    }
    for (let i = 0; i < ribbons.length; i++) {
        ctx.globalAlpha = alpha * (i + 0.5) / 8;
        ctx.strokeStyle = warmth > 0.5 ? '#ffb66d' : '#ffc782';
        ctx.lineWidth = Math.max(0.65, size * 0.028);
        ctx.stroke(ribbons[i].edge);
        ctx.globalAlpha *= 0.65;
        ctx.strokeStyle = '#ffe1a0';
        ctx.lineWidth *= 0.65;
        ctx.stroke(ribbons[i].core);
    }
    ctx.globalAlpha = alpha;
}
