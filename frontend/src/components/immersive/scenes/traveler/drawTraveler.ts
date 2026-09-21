import {clamp} from '@/lib/utils';
import {travelerSpan, type Traveler} from './traveler';
import {SCENE_TRAVEL_DISTANCE, sceneRandom, sampleSceneWaveform} from '../shared/scenery';
import {travelerPose} from './travelerGait';
import type {SceneFrame} from '../types';
import {mixPalette} from '../shared/sceneTransition';

interface TravelerFrame extends Omit<SceneFrame<Traveler>, 'moving'> {
    walking: boolean;
    walkPhase: number;
    stride: number;
}

export function drawTraveler(ctx: CanvasRenderingContext2D, scene: Traveler, frame: TravelerFrame) {
    const {width: w, height: h, ambientTime, walking, pointerX, pointerY, travel, layers: sources} = frame;
    const audioLevel = frame.audioLevel ?? 0;
    const {seed} = scene;
    const p = mixPalette(sources.map(source => ({palette: source.data.palette, weight: source.weight})));
    const scale = clamp(h / 760, 0.65, 1.4);
    const random = (index: number) => sceneRandom(seed, index);
    const anchor = w * 0.32;

    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.76);
    sky.addColorStop(0, p.sky);
    sky.addColorStop(0.53, p.haze);
    sky.addColorStop(0.85, p.horizon);
    sky.addColorStop(1, p.horizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 65; i++) {
        const x = ((random(i * 3) * w - travel * SCENE_TRAVEL_DISTANCE * 0.003 + pointerX * 2) % w + w) % w;
        const y = random(i * 3 + 1) * h * 0.39 + pointerY;
        ctx.globalAlpha = (0.18 + random(i * 3 + 2) * 0.5) * (1 - y / (h * 0.48));
        ctx.fillStyle = '#fff4dc';
        ctx.beginPath();
        ctx.arc(x, y, random(i + 400) > 0.94 ? 1.5 : 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    const sunX = w * 0.76 + pointerX * 3;
    const sunY = h * 0.37 + pointerY * 2;
    const radius = clamp(w * 0.032, 22, 48);
    const glowRadius = radius * 4;
    const glow = ctx.createRadialGradient(sunX, sunY, radius * 0.5, sunX, sunY, glowRadius);
    glow.addColorStop(0, '#ffe0a62e');
    glow.addColorStop(1, '#ffe0a600');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - glowRadius, sunY - glowRadius, glowRadius * 2, glowRadius * 2);
    ctx.fillStyle = '#ffe5bc';
    ctx.beginPath();
    ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Long translucent ribbons drift independently of the playback journey.
    for (let i = 0; i < 7; i++) {
        const cloudWidth = w * (0.15 + random(i + 600) * 0.22);
        const x = ((random(i + 610) * (w + cloudWidth) + ambientTime * (1 + i * 0.15)) % (w + cloudWidth * 2)) - cloudWidth;
        const y = h * (0.18 + random(i + 620) * 0.28) + pointerY * 3;
        ctx.fillStyle = '#f7d7c3';
        ctx.globalAlpha = 0.035 + random(i + 630) * 0.035;
        ctx.beginPath();
        ctx.ellipse(x, y, cloudWidth, h * 0.008, -0.025, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    const layers = [
        {speed: 0.17, baseline: 0.57, amplitude: 0.24, color: p.far, terrain: 0},
        {speed: 0.43, baseline: 0.66, amplitude: 0.23, color: p.middle, terrain: 1},
        {speed: 1, baseline: 0.79, amplitude: 0.2, color: p.ground, terrain: 2},
        {speed: 1.55, baseline: 0.99, amplitude: 0.13, color: p.foreground, terrain: 1},
    ];

    function tree(x: number, y: number, size: number, color: string, variation: number) {
        ctx.fillStyle = color;
        ctx.fillRect(x - size * 0.025, y - size * 0.6, size * 0.05, size * 0.63);
        for (let tier = 0; tier < 4; tier++) {
            const top = y - size + tier * size * 0.17;
            const spread = size * (0.13 + tier * 0.045);
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x + spread * (0.9 + variation * 0.2), top + size * 0.4);
            ctx.lineTo(x - spread, top + size * 0.38);
            ctx.closePath();
            ctx.fill();
        }
    }

    layers.forEach((layer, layerIndex) => {
        const shiftX = pointerX * layer.speed * 12;
        const shiftY = pointerY * layer.speed * 5;
        const samples = (scene: Traveler) => scene.terrain[layer.terrain];
        const surface = (x: number) => {
            const amplitude = sampleSceneWaveform(sources, samples, travelerSpan, (x - anchor - shiftX) / SCENE_TRAVEL_DISTANCE, layer.speed);
            return h * (layer.baseline - amplitude * layer.amplitude) + shiftY;
        };
        ctx.beginPath();
        ctx.moveTo(-8, h + 10);
        for (let x = -8; x <= w + 8; x += 4) ctx.lineTo(x, surface(x));
        ctx.lineTo(w + 8, h + 10);
        ctx.closePath();
        ctx.fillStyle = layer.color;
        ctx.fill();

        if (layerIndex === 2) {
            ctx.strokeStyle = '#c6cdb133';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = -8; x <= w + 8; x += 4) {
                if (x === -8) ctx.moveTo(x, surface(x) + 2);
                else ctx.lineTo(x, surface(x) + 2);
            }
            ctx.stroke();
        }

        // Decorations use world-space cells, so seeking returns to the same trees.
        const spacing = layerIndex === 3 ? 125 : 190;
        const worldOffset = travel * layer.speed * SCENE_TRAVEL_DISTANCE - anchor - shiftX;
        const first = Math.floor((worldOffset - 100) / spacing);
        const last = Math.ceil((worldOffset + w + 100) / spacing);
        if (layerIndex > 0) {
            for (let cell = first; cell <= last; cell++) {
                const value = random(cell * 11 + layerIndex * 10000);
                const x = cell * spacing + value * spacing * 0.7 - worldOffset;
                const y = surface(x);
                if ((layerIndex === 1 && value > 0.57) || (layerIndex === 2 && value > 0.76) || (layerIndex === 3 && value > 0.6)) {
                    const size = (layerIndex === 3 ? 95 : layerIndex === 2 ? 52 : 28) * scale * (0.65 + value * 0.7);
                    tree(x, y + 2, size, layer.color, value);
                }
                if (layerIndex >= 2) {
                    ctx.strokeStyle = layer.color;
                    ctx.lineWidth = layerIndex === 3 ? 2 : 1;
                    for (let blade = 0; blade < 5; blade++) {
                        const bladeX = x + blade * 3;
                        const bladeY = surface(bladeX);
                        const sway = Math.sin(ambientTime * 0.7 + cell) * 2;
                        ctx.beginPath();
                        ctx.moveTo(bladeX, bladeY + 2);
                        ctx.quadraticCurveTo(bladeX - 2, bladeY - 5, bladeX + (blade - 2) * 2 + sway, bladeY - (5 + value * 12) * scale);
                        ctx.stroke();
                    }
                }
            }
        }

        if (layerIndex !== 2) return;
        const travelerX = anchor + shiftX;
        const travelerY = surface(travelerX);
        const stride = frame.stride;
        const ground = (x: number) => (surface(travelerX + x * scale) - travelerY) / scale;
        const pose = travelerPose(frame.walkPhase * stride, stride, ground, walking);
        ctx.save();
        ctx.translate(travelerX, travelerY);
        ctx.scale(scale, scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const [index, leg] of pose.legs.entries()) {
            ctx.strokeStyle = index === 0 ? '#172f37' : '#29434a';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.moveTo(pose.hip.x, pose.hip.y);
            ctx.lineTo(leg.knee.x, leg.knee.y);
            ctx.lineTo(leg.foot.x, leg.foot.y);
            ctx.stroke();
            ctx.save();
            ctx.translate(leg.foot.x, leg.foot.y);
            ctx.rotate(leg.foot.angle);
            ctx.fillStyle = '#112b33';
            ctx.beginPath();
            ctx.moveTo(-2, -1.3);
            ctx.lineTo(1, -1.3);
            ctx.quadraticCurveTo(1.5, -0.2, 3, -0.2);
            ctx.quadraticCurveTo(4, -0.2, 4, 1.5);
            ctx.lineTo(-2, 1.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.translate(pose.hip.x, pose.hip.y);
        ctx.rotate(pose.lean);
        // The free arm counter-swings; the lantern hand stays relatively steady.
        ctx.strokeStyle = '#967961';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(-2, -11);
        ctx.lineTo(-3 - pose.armSwing * 2, -5);
        ctx.lineTo(-2 - pose.armSwing * 4, 0);
        ctx.stroke();

        ctx.fillStyle = '#c69777';
        ctx.beginPath();
        ctx.moveTo(-3, -13);
        ctx.lineTo(3, -13);
        ctx.lineTo(5, 1);
        ctx.lineTo(-5, 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#687b70';
        ctx.beginPath();
        ctx.roundRect(-7, -12, 5, 10, 2);
        ctx.fill();
        ctx.fillStyle = '#d2a68b';
        ctx.beginPath();
        ctx.arc(1, -18, 3.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#162e36';
        ctx.beginPath();
        ctx.ellipse(0.5, -21, 6, 1.6, -0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-2.5, -25, 6, 4);

        const handX = 9 + pose.armSwing * 0.7;
        const handY = -5 + pose.armSwing * 0.3;
        ctx.strokeStyle = '#c69777';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(3, -11);
        ctx.lineTo(5 + pose.armSwing, -5);
        ctx.lineTo(handX, handY);
        ctx.stroke();

        ctx.translate(handX, handY);
        ctx.rotate(-pose.lean + pose.lanternSwing * 0.07);
        ctx.strokeStyle = '#162e36';
        ctx.lineWidth = 1;
        ctx.strokeRect(-2, 0, 4, 5);
        const lanternRadius = 30 + audioLevel * 18;
        const lantern = ctx.createRadialGradient(0, 7, 0, 0, 7, lanternRadius);
        lantern.addColorStop(0, `rgba(255, 224, 166, ${0.3 + audioLevel * 0.35})`);
        lantern.addColorStop(1, '#ffe0a600');
        ctx.fillStyle = lantern;
        ctx.fillRect(-lanternRadius, 7 - lanternRadius, lanternRadius * 2, lanternRadius * 2);
        ctx.fillStyle = p.light;
        ctx.fillRect(-2, 4, 4, 6);
        ctx.restore();
    });

    const shade = ctx.createLinearGradient(0, h * 0.76, 0, h);
    shade.addColorStop(0, '#0a172000');
    shade.addColorStop(1, '#0a17207a');
    ctx.fillStyle = shade;
    ctx.fillRect(0, h * 0.76, w, h * 0.24);
}
