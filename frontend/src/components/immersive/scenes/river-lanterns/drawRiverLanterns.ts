import type {SceneFrame} from '../types';
import {mixPalette} from '../shared/sceneTransition';
import {sampleSceneWaveform, sceneRandom} from '../shared/scenery';
import {projectLantern, riverSpan, type RiverLanterns} from './riverLanterns';
import {drawWater, drawReflection} from './drawWater';
import {candleLight, drawLantern} from './drawLantern';
import {drawFog, FOG_LAYERS} from './drawFog';

function drawRiver(ctx: CanvasRenderingContext2D, data: RiverLanterns, frame: SceneFrame<RiverLanterns>) {
    const {width, height, ambientTime: time, layers} = frame;
    if (width <= 0 || height <= 0) return;
    const palette = mixPalette(layers.map(layer => ({palette: layer.data.palette, weight: layer.weight})));
    const shimmer = sampleSceneWaveform(layers, scene => scene.shimmer, riverSpan, 0) * 0.45 + (frame.audioLevel ?? 0) * 0.55;
    ctx.globalAlpha = 1;
    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.36);
    sky.addColorStop(0, palette.sky);
    sky.addColorStop(1, palette.haze);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    // Low wooded banks frame an opening downriver, leaving most of the view to water.
    for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = layer === 0 ? '#1a2932' : palette.bank;
        ctx.globalAlpha = 0.45 + layer * 0.2;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            const edge = side === -1 ? 0 : width;
            ctx.moveTo(edge, height * 0.37);
            for (let i = 0; i <= 60; i++) {
                const p = i / 60;
                const x = edge + side * -width * (0.46 - layer * 0.055) * p;
                const trees = sceneRandom(data.seed + layer * 500, i) * 0.016 * (1 - p);
                const y = height * (0.13 + layer * 0.02 + p * 0.14 - trees);
                ctx.lineTo(x, y);
            }
            ctx.lineTo(width * 0.5, height * 0.34);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
    drawWater(ctx, width, height, time, data.seed, palette);

    // Reflected banks taper toward the vanishing point instead of moving across the frame.
    for (const side of [-1, 1]) {
        const edge = side === -1 ? 0 : width;
        const bank = ctx.createLinearGradient(edge, 0, width * 0.5, 0);
        bank.addColorStop(0, 'rgba(3, 12, 18, 0.78)');
        bank.addColorStop(1, 'rgba(3, 12, 18, 0)');
        ctx.fillStyle = bank;
        ctx.fillRect(0, height * 0.28, width, height * 0.72);
    }
    const lanterns = data.lanterns.map(lantern => ({lantern, ...projectLantern(lantern, time, width, height)}))
        .sort((a, b) => a.depth - b.depth);
    let fogLayer = 0;
    for (const {lantern, x, y, size, depth, opacity} of lanterns) {
        while (fogLayer < FOG_LAYERS.length && FOG_LAYERS[fogLayer].depth < depth) {
            drawFog(ctx, width, height, time, data.seed, fogLayer++);
        }
        if (y - size > height || x + size * 3 < 0 || x - size * 3 > width) continue;
        const bob = Math.sin(time * 0.85 + lantern.turn) * size * 0.027;
        const light = candleLight(time, lantern);
        ctx.globalAlpha = opacity * light.intensity;
        drawReflection(ctx, x, y + bob, size, depth, time, lantern.turn, lantern.warmth, shimmer, height);
        // A few broad, faint ripples trail each floating base.
        for (let i = 0; i < 3; i++) {
            const pulse = ((time * 0.19 + i / 3 + lantern.phase) % 1);
            ctx.globalAlpha = opacity * light.intensity * (1 - pulse) * 0.12;
            ctx.strokeStyle = '#bb9973';
            ctx.lineWidth = Math.max(0.5, size * 0.012);
            ctx.beginPath();
            ctx.ellipse(x, y + bob - size * pulse * 0.15, size * (0.65 + pulse * 1.7), size * (0.11 + pulse * 0.38), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = opacity;
        drawLantern(ctx, x, y + bob, size, time, lantern, palette.paper, light);
    }
    while (fogLayer < FOG_LAYERS.length) {
        drawFog(ctx, width, height, time, data.seed, fogLayer++);
    }
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.43, height * 0.12, width * 0.5, height * 0.43, Math.max(width, height) * 0.74);
    vignette.addColorStop(0, 'rgba(2, 6, 14, 0)');
    vignette.addColorStop(1, 'rgba(2, 6, 14, 0.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
}

const surfaces = new WeakMap<CanvasRenderingContext2D, CanvasRenderingContext2D>();

export function drawRiverLanterns(ctx: CanvasRenderingContext2D, data: RiverLanterns, frame: SceneFrame<RiverLanterns>) {
    if (frame.width <= 0 || frame.height <= 0) return;
    let surface = surfaces.get(ctx);
    if (!surface) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', {alpha: false});
        if (!context) return;
        surface = context;
        surfaces.set(ctx, surface);
    }
    // Bound the cost of fine ripples on large/Retina screens; upsampling also softens the light.
    const ratio = Math.min(1, 1024 / frame.width, 720 / frame.height);
    const width = Math.round(frame.width * ratio);
    const height = Math.round(frame.height * ratio);
    if (surface.canvas.width !== width || surface.canvas.height !== height) {
        surface.canvas.width = width;
        surface.canvas.height = height;
    }
    surface.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawRiver(surface, data, frame);
    ctx.drawImage(surface.canvas, 0, 0, frame.width, frame.height);
}
