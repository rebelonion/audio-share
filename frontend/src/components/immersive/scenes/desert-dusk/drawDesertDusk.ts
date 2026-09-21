import {clamp} from '@/lib/utils';
import type {SceneFrame} from '../types';
import {SCENE_TRAVEL_DISTANCE, sampleSceneWaveform, sceneRandom} from '../shared/scenery';
import {mixPalette} from '../shared/sceneTransition';
import {DESERT_GROUND, desertGroundY, desertSpan, duneContour, type DesertDusk} from './desertDusk';
import {drawRuins} from './drawRuins';
import {drawCaravan} from './drawCaravan';
import {drawForegroundDetails, drawGroundDetails, drawMesas} from './drawDesertDetails';

interface DunePoint {x: number; y: number; world: number}

function drawDune(ctx: CanvasRenderingContext2D, points: DunePoint[], height: number, scale: number, light: string, shadow: string, ripples: number) {
    const first = points[0];
    const last = points[points.length - 1];
    ctx.beginPath(); ctx.moveTo(first.x, height);
    for (const point of points) ctx.lineTo(point.x, point.y);
    ctx.lineTo(last.x, height); ctx.closePath();
    ctx.fillStyle = shadow; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(first.x, first.y);
    for (const point of points) ctx.lineTo(point.x, point.y);
    for (let i = points.length - 1; i >= 0; i--) {
        const point = points[i];
        const fall = (44 + Math.sin(point.world / (380 * scale)) * 24) * scale;
        ctx.lineTo(point.x + 110 * scale, point.y + fall);
    }
    ctx.closePath(); ctx.fillStyle = light; ctx.fill();
    ctx.strokeStyle = '#ffdbad'; ctx.globalAlpha = 0.22; ctx.lineWidth = scale;
    ctx.beginPath();
    points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y + scale) : ctx.moveTo(point.x, point.y + scale));
    ctx.stroke();
    ctx.strokeStyle = '#f3c39b'; ctx.lineWidth = 0.65 * scale;
    for (let row = 1; row <= ripples; row++) {
        ctx.globalAlpha = 0.1 * (1 - row / (ripples + 2));
        ctx.beginPath();
        points.forEach((point, i) => {
            const y = point.y + (11 * row + row * row * 1.6) * scale + Math.sin(point.world / (95 * scale) + row * 0.4) * row * 0.7 * scale;
            if (i === 0) ctx.moveTo(point.x, y);
            else ctx.lineTo(point.x, y);
        });
        ctx.stroke();
    }
    ctx.restore();
}

export function drawDesertDusk(ctx: CanvasRenderingContext2D, scene: DesertDusk, frame: SceneFrame<DesertDusk>) {
    const {width: w, height: h, travel, pointerX, pointerY, ambientTime: time, layers} = frame;
    if (!w || !h) return;
    const s = clamp(h / 850, 0.55, 1.4);
    const p = mixPalette(layers.map(layer => ({palette: layer.data.palette, weight: layer.weight})));
    const random = (index: number) => sceneRandom(scene.seed, index);
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.68);
    sky.addColorStop(0, p.sky); sky.addColorStop(0.56, p.haze); sky.addColorStop(1, p.horizon);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 32; i++) {
        const x = random(i + 10) * w + pointerX * 2;
        const y = random(i + 80) * h * 0.31;
        ctx.globalAlpha = (0.12 + random(i + 120) * 0.32) * (1 - y / (h * 0.4));
        ctx.fillStyle = p.sun;
        ctx.beginPath(); ctx.arc(x, y, (0.5 + random(i + 160) * 0.55) * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const sunX = w * 0.69 + pointerX * 3;
    const sunY = h * 0.465 + pointerY * 2;
    const halo = ctx.createRadialGradient(sunX, sunY, 22 * s, sunX, sunY, 210 * s);
    halo.addColorStop(0, '#ffc48636'); halo.addColorStop(1, '#ffc48600');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.sun;
    ctx.beginPath(); ctx.arc(sunX, sunY, 37 * s, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = p.horizon;
    for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.12 + i * 0.045;
        ctx.fillRect(sunX - 38 * s, sunY + (i * 8 - 1) * s, 76 * s, (1 + i * 0.6) * s);
    }
    ctx.restore();

    drawMesas(ctx, scene.seed, frame, s, p);
    for (const [depth, speed, base, amplitude, light, shadow] of [
        [0, 0.13, 0.625, 0.07, p.far, p.farShadow],
        [1, 0.25, 0.72, 0.08, p.sand, p.sandShadow],
    ] as const) {
        const points: DunePoint[] = [];
        const camera = travel * SCENE_TRAVEL_DISTANCE * speed;
        for (let x = -160 * s; x <= w + 160 * s; x += 6) {
            const world = x + camera;
            const wave = sampleSceneWaveform(layers, data => depth === 0 ? data.distant : data.dunes, desertSpan, (x - w * 0.5) / SCENE_TRAVEL_DISTANCE / speed);
            points.push({x: x + pointerX * (4 + depth * 5), world, y: h * (base + duneContour(world, s, depth * 1.9) - wave * amplitude) + pointerY * (depth + 1)});
        }
        drawDune(ctx, points, h, s, light, shadow, 0);
    }

    const camera = travel * SCENE_TRAVEL_DISTANCE * DESERT_GROUND.speed;
    const groundPoints: DunePoint[] = [];
    for (let x = -160 * s; x <= w + 160 * s; x += 6) {
        groundPoints.push({x: x + pointerX * DESERT_GROUND.parallaxX, world: x + camera, y: desertGroundY(x + camera, h, s) + pointerY * DESERT_GROUND.parallaxY});
    }
    const cell = Math.max(1100 * s, w * 1.05);
    const first = Math.floor((camera - w) / cell);
    const last = Math.ceil((camera + w) / cell);
    ctx.save(); ctx.translate(pointerX * DESERT_GROUND.parallaxX, pointerY * DESERT_GROUND.parallaxY);
    for (let i = first; i <= last; i++) {
        const world = i * cell + w * 0.72;
        const x = world - camera;
        const ruinScale = (0.64 + random(i + 300) * 0.23) * s;
        if (x > -200 * s && x < w + 200 * s && random(i + 310) > 0.2) {
            let base = 0;
            for (let dx = -125 * ruinScale; dx <= 125 * ruinScale; dx += 5) base = Math.max(base, desertGroundY(world + dx, h, s));
            drawRuins(ctx, x, base + 10 * s, ruinScale, scene.seed + i * 31, p);
        }
    }
    const caravanCamera = camera - time * 2 * s;
    const caravanFirst = Math.floor((caravanCamera - w) / cell);
    const caravanLast = Math.ceil((caravanCamera + w) / cell);
    for (let i = caravanFirst; i <= caravanLast; i++) {
        const world = i * cell + w * 0.18;
        const x = world - caravanCamera;
        if ((i === 0 || random(i + 320) > 0.4) && x > -340 * s && x < w + 100 * s) {
            drawCaravan(ctx, world, camera, h, s, scene.seed + i * 43, time, p);
        }
    }
    ctx.restore();
    drawDune(ctx, groundPoints, h, s, p.ground, p.groundShadow, 8);
    drawGroundDetails(ctx, scene.seed, frame, s, p);

    const nearPoints: DunePoint[] = [];
    const nearCamera = travel * SCENE_TRAVEL_DISTANCE * 0.78;
    const nearGroundY = (world: number) => h * (0.965 + duneContour(world, s, 5.1) * 1.2);
    for (let x = -160 * s; x <= w + 160 * s; x += 6) {
        const world = x + nearCamera;
        nearPoints.push({x: x + pointerX * 27, world, y: nearGroundY(world) + pointerY * 11});
    }
    drawDune(ctx, nearPoints, h, s, p.near, p.nearShadow, 6);
    ctx.save(); ctx.translate(pointerX * 27, pointerY * 11);
    drawForegroundDetails(ctx, scene.seed, w, nearCamera, s, time, nearGroundY, p);
    ctx.restore();

    ctx.save(); ctx.strokeStyle = p.sun; ctx.lineWidth = 0.7 * s;
    for (let i = 0; i < 36; i++) {
        const progress = (time * (0.022 + random(i + 510) * 0.014) + random(i + 520)) % 1;
        const x = progress * (w + 180 * s) - 90 * s;
        const y = h * (0.73 + random(i + 540) * 0.22) + Math.sin(time * 0.25 + i) * 3 * s;
        ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 17 * s, y - 2 * s, x + (25 + random(i + 560) * 35) * s, y - 3 * s); ctx.stroke();
    }
    ctx.restore();
    const shade = ctx.createLinearGradient(0, h * 0.6, 0, h);
    shade.addColorStop(0, 'transparent'); shade.addColorStop(1, '#211e304d');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
}
