import {clamp} from '@/lib/utils';
import {drawBuilding} from './drawBuilding';
import {drawRain} from './drawRain';
import {drawCarriageSeat} from './drawInterior';
import type {SceneFrame} from '../types';
import {SCENE_TRAVEL_DISTANCE, sampleSceneWaveform, sceneRandom} from '../shared/scenery';
import {trainSpan, type NightTrain} from './nightTrain';
import {mixPalette} from '../shared/sceneTransition';

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function drawNightTrain(ctx: CanvasRenderingContext2D, scene: NightTrain, frame: SceneFrame<NightTrain>) {
    const {width: w, height: h, ambientTime, pointerX, pointerY, travel, layers: sources} = frame;
    const colors = mixPalette(sources.map(source => ({palette: source.data.palette, weight: source.weight})));
    if (!w || !h) return;
    const audioLevel = frame.audioLevel ?? 0;
    const scale = clamp(h / 800, 0.6, 1.5);
    const random = (index: number) => sceneRandom(scene.seed, index);
    const horizon = h * 0.61;
    const shoreline = h * 0.66;
    const inset = clamp(w * 0.035, 14, 60);
    const top = Math.max(74, h * 0.105);
    const bottom = h * 0.86;
    const radius = Math.min(48 * scale, w * 0.09);
    const windowPath = new Path2D();
    windowPath.roundRect(inset, top, w - inset * 2, Math.max(1, bottom - top), radius);

    // The carriage stays still while each layer beyond the glass travels at its own speed.
    const interior = ctx.createLinearGradient(0, 0, 0, h);
    interior.addColorStop(0, colors.carriage);
    interior.addColorStop(0.5, '#141a20');
    interior.addColorStop(1, '#171b21');
    ctx.fillStyle = interior;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.72, 0, w * 0.65, `rgba(233, 187, 125, ${0.078 + audioLevel * 0.15})`);
    ctx.save();
    ctx.translate(w * 0.55, top * 0.1);
    ctx.scale(w * 0.6, top * 1.1);
    ctx.globalAlpha = 0.16 + audioLevel * 0.25;
    glow(ctx, 0, 0, 1, colors.light);
    ctx.restore();

    ctx.save();
    ctx.clip(windowPath);
    const sky = ctx.createLinearGradient(0, top, 0, shoreline);
    sky.addColorStop(0, colors.midnight);
    sky.addColorStop(0.7, colors.sky);
    sky.addColorStop(1, colors.twilight);
    ctx.fillStyle = sky;
    ctx.fillRect(0, top, w, bottom - top);
    ctx.save();
    ctx.globalAlpha = 0.06;
    glow(ctx, w * 0.65, horizon, Math.min(w * 0.3, h * 0.4), colors.accent);
    ctx.restore();

    for (let i = 0; i < 65; i++) {
        const x = random(i * 5) * w + pointerX * 2;
        const y = top + random(i * 5 + 1) * (horizon - top) * 0.75;
        ctx.fillStyle = `rgba(215, 228, 235, ${0.1 + random(i * 5 + 2) * 0.35})`;
        ctx.fillRect(x, y, random(i * 5 + 3) > 0.85 ? 1.5 : 0.8, 0.8);
    }
    const moonX = w * 0.79 + pointerX * 3;
    const moonY = top + (horizon - top) * 0.28 + pointerY * 2;
    glow(ctx, moonX, moonY, 85 * scale, '#d3e0e81b');
    ctx.fillStyle = '#c4d2d9';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 15 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9daebc55';
    ctx.beginPath();
    ctx.ellipse(moonX - 3 * scale, moonY + 3 * scale, 6 * scale, 9 * scale, -0.4, 0, Math.PI * 2);
    ctx.fill();

    for (const [layer, factor, base, height, color] of [
        [0, 0.18, 0.60, 0.17, colors.far],
        [1, 0.35, 0.64, 0.12, colors.hill],
    ] as const) {
        const camera = travel * SCENE_TRAVEL_DISTANCE * factor - w * 0.5;
        ctx.beginPath();
        ctx.moveTo(-10, shoreline);
        for (let x = -10; x <= w + 10; x += 5) {
            const world = x + camera;
            const amplitude = sampleSceneWaveform(sources, scene => scene.hills, trainSpan, (x - w * 0.5) / SCENE_TRAVEL_DISTANCE / factor);
            const ridge = Math.sin(world / (160 * scale) + layer * 2) * h * 0.015;
            ctx.lineTo(x + pointerX * (5 + layer * 6), h * base - amplitude * h * height + ridge + pointerY * 3);
        }
        ctx.lineTo(w + 20, shoreline + 10);
        ctx.lineTo(-20, shoreline + 10);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    const lake = ctx.createLinearGradient(0, shoreline, 0, bottom);
    lake.addColorStop(0, colors.lake);
    lake.addColorStop(1, colors.lakeDeep);
    ctx.fillStyle = lake;
    ctx.fillRect(0, shoreline, w, bottom - shoreline);
    for (let i = 0; i < 55; i++) {
        const depth = random(1400 + i * 3);
        const x = random(1401 + i * 3) * w + Math.sin(ambientTime * 0.3 + i) * 2;
        ctx.fillStyle = `rgba(125, 157, 174, ${0.025 + (1 - depth) * 0.035})`;
        ctx.fillRect(x, shoreline + depth * h * 0.15, (8 + random(1402 + i * 3) * 55) * scale, scale);
    }

    // A stable world grid keeps each building and its windows intact when seeking backwards.
    const bank = shoreline + pointerY * 4;
    ctx.fillStyle = colors.shore;
    ctx.fillRect(0, bank - 2 * scale, w, 5 * scale);
    ctx.fillStyle = '#59717a30';
    ctx.fillRect(0, bank + 3 * scale, w, scale);
    const cell = 66 * scale;
    const camera = travel * SCENE_TRAVEL_DISTANCE - w * 0.5;
    const first = Math.floor(camera / cell) - 1;
    const last = Math.ceil((camera + w) / cell) + 1;
    for (let i = first; i <= last; i++) {
        const district = (Math.sin(i * 0.37 + random(1200) * 6) + 1) / 2;
        if (random(i * 31 + 4000) > 0.4 + district * 0.5) continue;
        const x = i * cell - camera + pointerX * 13;
        const width = (28 + random(i * 31 + 4001) * 30) * scale;
        const amplitude = sampleSceneWaveform(sources, scene => scene.skyline, trainSpan, i * cell / SCENE_TRAVEL_DISTANCE - travel);
        const height = (18 + amplitude * 105) * (0.55 + district * 0.45) * scale;
        const base = shoreline + pointerY * 4;
        const lightColor = random(i * 31 + 4002) < 0.35 ? colors.light : colors.amber;
        drawBuilding(ctx, scene.seed, i, x, base, width, height, scale, lightColor, audioLevel);
        ctx.save();
        ctx.fillStyle = lightColor;
        for (let ripple = 0; ripple < 7; ripple++) {
            const spread = Math.sin(ambientTime * 0.6 + i + ripple * 2) * 3 * scale;
            ctx.globalAlpha = (0.12 + audioLevel * 0.2) * (1 - ripple / 8);
            ctx.fillRect(x + width * 0.25 + spread, base + (5 + ripple * 6) * scale, width * (0.4 + random(i + ripple) * 0.4), scale);
        }
        ctx.restore();
    }

    // Shore lights, a low embankment, and rails pass progressively closer to the window.
    ctx.fillStyle = colors.forest;
    ctx.beginPath();
    ctx.moveTo(0, bottom);
    for (let x = 0; x <= w + 8; x += 8) {
        const world = x + travel * 40 * 80 * scale;
        ctx.lineTo(x, h * 0.805 + Math.sin(world * 0.006) * h * 0.008 + Math.sin(world * 0.017) * 3 * scale);
    }
    ctx.lineTo(w, bottom);
    ctx.fill();
    for (let line = 0; line < 2; line++) {
        const y = h * (0.83 + line * 0.014);
        ctx.fillStyle = '#81919430';
        ctx.fillRect(0, y, w, 1.5 * scale);
        const spacing = 75 * scale;
        const offset = (travel * 40 * 260 * scale) % spacing;
        ctx.fillStyle = '#080f1770';
        for (let x = -spacing; x < w + spacing; x += spacing) {
            ctx.fillRect(x - offset, y + 2 * scale, 6 * scale, 8 * scale);
        }
    }

    const poleSpacing = 660 * scale;
    const poleCamera = travel * 40 * 125 * scale;
    const poleStart = Math.floor(poleCamera / poleSpacing);
    for (let i = poleStart; i * poleSpacing - poleCamera < w + poleSpacing; i++) {
        const x = i * poleSpacing - poleCamera + pointerX * 24;
        const y = h * 0.34 + pointerY * 5;
        ctx.strokeStyle = '#10202add';
        ctx.lineWidth = 5 * scale;
        ctx.beginPath();
        ctx.moveTo(x, bottom);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 32 * scale, y);
        ctx.stroke();
        ctx.lineWidth = scale;
        ctx.beginPath();
        ctx.moveTo(x, y + 15 * scale);
        ctx.quadraticCurveTo(x + poleSpacing * 0.5, y + 48 * scale, x + poleSpacing, y + 15 * scale);
        ctx.stroke();
        if (i % 3 === 0) {
            const lightY = h * 0.74;
            glow(ctx, x + 6 * scale, lightY, 18 * scale, '#e9bb7d20');
            ctx.fillStyle = colors.amber;
            ctx.fillRect(x + 4 * scale, lightY, 3 * scale, 4 * scale);
        }
    }

    // Reflections sit on the glass, moving opposite to the view as the viewer leans.
    ctx.save();
    ctx.translate(-pointerX * 10, -pointerY * 6);
    ctx.rotate(-0.045);
    const reflection = ctx.createLinearGradient(w * 0.48, 0, w * 0.92, 0);
    reflection.addColorStop(0, 'transparent');
    reflection.addColorStop(0.3, colors.light);
    reflection.addColorStop(0.8, colors.light);
    reflection.addColorStop(1, 'transparent');
    ctx.fillStyle = reflection;
    ctx.globalAlpha = 0.22 + audioLevel * 0.3;
    ctx.beginPath();
    ctx.roundRect(w * 0.48, top + 55 * scale, w * 0.45, 9 * scale, 4 * scale);
    ctx.fill();
    ctx.globalAlpha = 0.09 + audioLevel * 0.15;
    ctx.fillRect(w * 0.6, top + 78 * scale, w * 0.32, 2 * scale);
    ctx.restore();

    drawRain(ctx, scene.seed, ambientTime, w, top, bottom, scale, pointerX);

    const glassShade = ctx.createLinearGradient(0, top, 0, bottom);
    glassShade.addColorStop(0, '#070e1c45');
    glassShade.addColorStop(0.35, '#070e1c00');
    glassShade.addColorStop(0.75, '#070e1c00');
    glassShade.addColorStop(1, '#070e1c55');
    ctx.fillStyle = glassShade;
    ctx.fillRect(0, top, w, bottom - top);
    ctx.restore();

    // A continuous bevel follows the gasket, including both rounded lower corners.
    const trim = ctx.createLinearGradient(0, top, 0, bottom + 14 * scale);
    trim.addColorStop(0, '#4c4847');
    trim.addColorStop(0.12, '#2f3034');
    trim.addColorStop(0.82, '#272d33');
    trim.addColorStop(0.96, '#4d4743');
    trim.addColorStop(1, '#6a5b4d');
    ctx.strokeStyle = trim;
    ctx.lineWidth = 25 * scale;
    ctx.stroke(windowPath);
    ctx.strokeStyle = '#0c1119';
    ctx.lineWidth = 13 * scale;
    ctx.stroke(windowPath);
    ctx.strokeStyle = '#a18a6f35';
    ctx.lineWidth = 1.2 * scale;
    ctx.stroke(windowPath);

    drawCarriageSeat(ctx, w, h, scale, colors);
}
