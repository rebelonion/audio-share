import {clamp} from '@/lib/utils';
import {approachSection} from './approach';
import type {SceneFrame} from '../types';
import {SCENE_TRAVEL_DISTANCE, sceneRandom} from '../shared/scenery';
import {mixPalette} from '../shared/sceneTransition';
import type {ShrinePath} from './shrinePath';
import {drawShrine, drawStoneLantern, drawTorii, lanternGlow} from './drawArchitecture';
import {drawGardenRocks, drawPine} from './drawGarden';
import {drawCherryTree} from './drawCherryTree';
import {drawVillage} from './drawVillage';
import {drawGardenLandmark} from './drawGardenLandmark';
import {landmarkAt} from './landmarks';
import {createRidgeProfile, SHRINE_RIDGES} from './terrain';

export function drawShrinePath(ctx: CanvasRenderingContext2D, scene: ShrinePath, frame: SceneFrame<ShrinePath>) {
    const {width: w, height: h, travel, pointerX, pointerY, ambientTime: time, layers} = frame;
    if (!w || !h) return;
    const p = mixPalette(layers.map(layer => ({palette: layer.data.palette, weight: layer.weight})));
    const s = clamp(h / 850, 0.55, 1.4);
    const random = (index: number) => sceneRandom(scene.seed, index);
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.68);
    sky.addColorStop(0, p.sky);
    sky.addColorStop(0.55, p.haze);
    sky.addColorStop(1, p.horizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sunX = w * 0.78 + pointerX * 3;
    const sunY = h * 0.345 + pointerY * 2;
    ctx.save(); ctx.globalAlpha = 0.18;
    lanternGlow(ctx, sunX, sunY, 140 * s, p.lantern);
    ctx.restore();
    ctx.fillStyle = '#e6c7a4';
    ctx.beginPath(); ctx.arc(sunX, sunY, 24 * s, 0, Math.PI * 2); ctx.fill();

    for (let band = 0; band < 5; band++) {
        const y = h * (0.29 + band * 0.052);
        const drift = Math.sin(time * 0.016 + band) * 20 * s;
        ctx.save();
        ctx.translate(w * random(10 + band) + drift, y);
        ctx.scale(w * 0.55, 10 * s);
        ctx.globalAlpha = 0.14;
        lanternGlow(ctx, 0, 0, 1, p.horizon);
        ctx.restore();
    }

    const ridgeProfiles = SHRINE_RIDGES.map((_, depth) => createRidgeProfile(frame, depth, s));
    ridgeProfiles.forEach((profile, depth) => {
        ctx.beginPath(); ctx.moveTo(profile.start, h);
        profile.heights.forEach((y, i) => ctx.lineTo(profile.start + i * profile.step, y));
        ctx.lineTo(profile.start + (profile.heights.length - 1) * profile.step, h);
        ctx.closePath(); ctx.fillStyle = p[SHRINE_RIDGES[depth].color]; ctx.fill();
    });

    drawVillage(ctx, scene.seed, frame, ridgeProfiles[2], s, p);

    const ground = ctx.createLinearGradient(0, h * 0.66, 0, h);
    ground.addColorStop(0, p.ground);
    ground.addColorStop(1, p.pine);
    ctx.fillStyle = ground;
    ctx.beginPath(); ctx.moveTo(-10, h);
    for (let x = -10; x <= w + 10; x += 10) {
        ctx.lineTo(x, h * 0.68 + Math.sin((x + travel * SCENE_TRAVEL_DISTANCE * 0.5) / (220 * s)) * h * 0.008);
    }
    ctx.lineTo(w + 10, h); ctx.fill();

    const camera = travel * SCENE_TRAVEL_DISTANCE * 0.56 - w * 0.5;
    const cell = Math.max(920 * s, w * 0.84);
    const first = Math.floor(camera / cell) - 1;
    const last = Math.ceil((camera + w) / cell) + 1;
    const gateBase = h * 0.79 + pointerY * 8;
    const shrineBase = h * 0.704 + pointerY * 5;
    const approachEnd = h * 0.813 + pointerY * 10;

    for (let i = first; i <= last; i++) {
        const centerX = i * cell - camera + pointerX * 15;
        const section = (depth: number) => approachSection(centerX, shrineBase, gateBase, s, depth, w);
        const start = section(0);
        if (Math.min(centerX, start.x) > w + 350 * s || Math.max(centerX, start.x) < -350 * s) continue;
        const landmark = landmarkAt(scene.seed, i);
        const landmarkSeed = scene.seed + i * 97;
        const detail = (index: number) => sceneRandom(landmarkSeed, index + 3000);
        if (landmark !== 'shrine') {
            const gardenY = shrineBase + (gateBase - shrineBase) * 0.52;
            drawGardenLandmark(ctx, landmark, centerX, start.x, shrineBase, gardenY, s, landmarkSeed, time, p);
            continue;
        }
        const end = section((approachEnd - shrineBase) / (gateBase - shrineBase));
        ctx.fillStyle = p.path;
        ctx.beginPath();
        ctx.moveTo(start.left.x, start.left.y); ctx.lineTo(start.right.x, start.right.y);
        ctx.lineTo(end.right.x, end.right.y); ctx.lineTo(end.left.x, end.left.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#c2baa438';
        ctx.lineWidth = s;
        for (let row = 1; row < 12; row++) {
            const paving = section(row / 12 * (approachEnd - shrineBase) / (gateBase - shrineBase));
            ctx.beginPath(); ctx.moveTo(paving.left.x, paving.left.y); ctx.lineTo(paving.right.x, paving.right.y); ctx.stroke();
        }
        for (const side of [-1, 1]) {
            const treeX = start.x + side * (155 + detail(side + 10) * 35) * s;
            const height = (140 + detail(side + 20) * 85) * s;
            if (detail(side + 30) > 0.52) {
                drawCherryTree(ctx, treeX, shrineBase, height, landmarkSeed + side * 23, time);
            } else {
                drawPine(ctx, treeX, shrineBase + 5 * s, height, landmarkSeed + side * 23, p.pine, time);
            }
        }
        drawShrine(ctx, start.x, shrineBase, (0.8 + detail(1) * 0.24) * s, p, detail(2) > 0.5 ? 0 : 1);

        const rearGates = Math.floor(detail(3) * 3);
        for (let gateIndex = 0; gateIndex < rearGates; gateIndex++) {
            const depth = rearGates === 1 ? 0.52 : 0.35 + gateIndex * 0.3;
            const gate = section(depth);
            drawTorii(ctx, gate.x, gate.y, gate.scale, p, time);
        }
        drawGardenRocks(ctx, centerX - 130 * s, gateBase - 7 * s, s, scene.seed + i, p);
        const lamps = section((gateBase - 12 * s - shrineBase) / (gateBase - shrineBase));
        for (const side of [-1, 1]) {
            const lampOffset = side * (lamps.halfWidth + 80 * s);
            drawStoneLantern(ctx, lamps.x + lampOffset, lamps.y, s * (0.68 + detail(4) * 0.22), p);
        }
        drawTorii(ctx, centerX, gateBase, s, p, time);
    }

    // The public path crosses the foreground; joints stay fixed in world space.
    const pathTop = h * 0.81 + pointerY * 10;
    const pathBottom = h * 0.91 + pointerY * 12;
    const path = ctx.createLinearGradient(0, pathTop, 0, pathBottom);
    path.addColorStop(0, '#72786b'); path.addColorStop(1, '#495c50');
    ctx.fillStyle = path; ctx.fillRect(0, pathTop, w, pathBottom - pathTop);
    ctx.fillStyle = '#a8ab8a40'; ctx.fillRect(0, pathTop, w, 2 * s);
    ctx.strokeStyle = '#253e3545'; ctx.lineWidth = s;
    for (let row = 0; row < 3; row++) {
        const y = pathTop + (pathBottom - pathTop) * row / 3;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        const spacing = (70 + row * 22) * s;
        const shift = ((travel * SCENE_TRAVEL_DISTANCE * 0.82 - pointerX * 19) + row * 31 * s) % spacing;
        for (let x = -spacing; x <= w + spacing; x += spacing) {
            ctx.beginPath(); ctx.moveTo(x - shift, y); ctx.lineTo(x - shift - 9 * s, y + (pathBottom - pathTop) / 3); ctx.stroke();
        }
    }

    const nearCamera = travel * SCENE_TRAVEL_DISTANCE * 0.95;
    const nearCell = 1070 * s;
    const nearStart = Math.floor((nearCamera - w) / nearCell);
    const nearEnd = Math.ceil((nearCamera + w) / nearCell);
    for (let i = nearStart; i <= nearEnd; i++) {
        const x = i * nearCell - nearCamera - 72 * s + pointerX * 28;
        if (x < -210 * s || x > w + 210 * s) continue;
        drawPine(ctx, x, h * 1.01 + pointerY * 15, (290 + random(i + 850) * 50) * s, scene.seed + i * 41, '#182f2b', time);
        drawGardenRocks(ctx, x + 105 * s, h * 0.955, s * 1.7, scene.seed + i * 31, p);
    }

    // Low plants soften the edge without obscuring the playback controls.
    ctx.fillStyle = '#1b352dcc';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 6; x += 6) {
        const world = x + nearCamera;
        ctx.lineTo(x, h * 0.945 + Math.sin(world * 0.009) * 7 * s + Math.sin(world * 0.031) * 3 * s);
    }
    ctx.lineTo(w + 6, h); ctx.fill();

    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, '#16243535');
    shade.addColorStop(0.3, 'transparent');
    shade.addColorStop(0.74, 'transparent');
    shade.addColorStop(1, '#101f2470');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
}
