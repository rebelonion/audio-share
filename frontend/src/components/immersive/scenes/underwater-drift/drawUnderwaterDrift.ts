import {clamp} from '@/lib/utils';
import type {SceneFrame} from '../types';
import {SCENE_TRAVEL_DISTANCE, sampleSceneWaveform, sceneRandom} from '../shared/scenery';
import {mixPalette} from '../shared/sceneTransition';
import {underwaterSpan, type UnderwaterDrift} from './underwaterDrift';
import {drawReef} from './drawReef';
import {drawSeaLife} from './drawSeaLife';

export function drawUnderwaterDrift(ctx: CanvasRenderingContext2D, scene: UnderwaterDrift, frame: SceneFrame<UnderwaterDrift>) {
    const {width: w, height: h, travel, pointerX, pointerY, ambientTime: time, layers} = frame;
    if (!w || !h) return;
    const s = clamp(h / 850, 0.55, 1.4);
    const p = mixPalette(layers.map(layer => ({palette: layer.data.palette, weight: layer.weight})));
    const random = (i: number) => sceneRandom(scene.seed, i);
    const water = ctx.createLinearGradient(0, 0, w * 0.4, h);
    water.addColorStop(0, p.surface); water.addColorStop(0.35, p.water);
    water.addColorStop(0.8, p.deep); water.addColorStop(1, p.abyss);
    ctx.fillStyle = water; ctx.fillRect(0, 0, w, h);

    ctx.save();
    for (let i = -1; i < Math.ceil(w / (210 * s)); i++) {
        const x = (i + 0.35) * 210 * s + Math.sin(time * 0.12 + i * 2) * 18 * s + pointerX * 3;
        const reach = h * (0.63 + random(i + 5) * 0.3);
        ctx.save(); ctx.translate(x, -20); ctx.transform(1, 0, 0.38, 1, 0, 0);
        ctx.scale((45 + random(i + 15) * 30) * s, reach);
        const beam = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        beam.addColorStop(0, '#b1e1cd1c'); beam.addColorStop(0.4, '#b1e1cd0f'); beam.addColorStop(1, '#b1e1cd00');
        ctx.fillStyle = beam;
        ctx.fillRect(-1, 0, 2, 1); ctx.restore();
    }
    ctx.strokeStyle = p.light; ctx.lineWidth = 1.2 * s;
    for (let row = 0; row < 14; row++) {
        const y = row * row * 0.49 * s;
        ctx.globalAlpha = 0.035 + (1 - row / 14) * 0.055;
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 12) {
            const sy = y + Math.sin(x / (63 * s) + time * 0.22 + row) * (2 + row * 0.3) * s;
            if (x === -20) ctx.moveTo(x, sy); else ctx.lineTo(x, sy);
        }
        ctx.stroke();
    }
    ctx.restore();

    for (const [depth, speed, base, amplitude, color] of [
        [0, 0.1, 0.72, 0.13, p.distant],
        [1, 0.21, 0.83, 0.11, p.ridge],
    ] as const) {
        const camera = travel * SCENE_TRAVEL_DISTANCE * speed;
        ctx.beginPath(); ctx.moveTo(-100 * s, h);
        for (let x = -100 * s; x <= w + 110 * s; x += 6) {
            const world = x + camera;
            const wave = sampleSceneWaveform(layers, data => depth === 0 ? data.distant : data.ridge, underwaterSpan, (x - w * 0.5) / SCENE_TRAVEL_DISTANCE / speed);
            const contour = Math.sin(world / (240 * s) + depth * 3) * 0.045 + Math.sin(world / (101 * s) + 1.3) * 0.018;
            ctx.lineTo(x + pointerX * (3 + depth * 5), h * (base + contour - wave * amplitude) + pointerY * (depth + 1));
        }
        ctx.lineTo(w + 110 * s, h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }

    drawSeaLife(ctx, scene, frame, s, p);
    drawReef(ctx, scene, frame, s, p);

    // Particles use world cells so scrubbing reverses parallax without changing the field.
    ctx.save(); ctx.fillStyle = p.light;
    const cell = 230 * s;
    for (let depth = 0; depth < 2; depth++) {
        const camera = travel * SCENE_TRAVEL_DISTANCE * (depth ? 0.65 : 0.18);
        for (let i = Math.floor(camera / cell) - 1; i <= Math.ceil((camera + w) / cell); i++) {
            for (let j = 0; j < 12; j++) {
                const index = i * 31 + j + depth * 400;
                const x = (i + random(index + 700)) * cell - camera + Math.sin(time * 0.17 + index) * 10 * s + pointerX * (depth ? 22 : 5);
                const cycle = random(index + 900) + time * (depth ? 0.0025 : 0.001);
                const y = (1 - cycle % 1) * h;
                ctx.globalAlpha = (0.08 + random(index + 1100) * 0.2) * Math.sin((y / h) * Math.PI);
                ctx.beginPath(); ctx.ellipse(x, y, (depth ? 1.3 : 0.7) * s, (depth ? 1.7 : 0.7) * s, 0.2, 0, Math.PI * 2); ctx.fill();
            }
        }
    }
    ctx.restore();
    const shade = ctx.createLinearGradient(0, h * 0.65, 0, h);
    shade.addColorStop(0, '#04131e00'); shade.addColorStop(1, '#04131e80');
    ctx.fillStyle = shade; ctx.fillRect(0, h * 0.65, w, h * 0.35);
}
