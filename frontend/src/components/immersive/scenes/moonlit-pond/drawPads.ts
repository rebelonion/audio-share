import type {PondContext} from './pondCanvas';
import {sceneRandom} from '../shared/scenery';
import {surfaceSlope, type Drop, type PositionedPad, type POND_PALETTE} from './pond';

function padPath(pad: PositionedPad): Path2D {
    const path = new Path2D();
    path.moveTo(-pad.radius * 0.06, 0);
    for (let i = 0; i <= 80; i++) {
        const angle = 0.19 + i / 80 * (Math.PI * 2 - 0.38);
        const radius = pad.radius * (1 + Math.sin(angle * 5 + pad.phase) * 0.035 + Math.sin(angle * 9) * 0.012);
        path.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    path.closePath();
    return path;
}

function drawFlower(ctx: PondContext, radius: number, phase: number, color: string) {
    ctx.save();
    ctx.translate(-radius * 0.12, -radius * 0.08);
    ctx.rotate(phase);
    ctx.shadowColor = 'rgba(1, 13, 19, 0.65)';
    ctx.shadowBlur = radius * 0.12;
    ctx.shadowOffsetY = radius * 0.06;
    for (let layer = 0; layer < 3; layer++) {
        const count = 10 - layer * 2;
        const reach = radius * (0.62 - layer * 0.15);
        for (let i = 0; i < count; i++) {
            ctx.save();
            ctx.rotate(i / count * Math.PI * 2 + layer * 0.35);
            const petal = ctx.createLinearGradient(0, 0, 0, -reach);
            petal.addColorStop(0, '#817e74');
            petal.addColorStop(0.5, color);
            petal.addColorStop(1, '#e3e5d7');
            ctx.fillStyle = petal;
            ctx.beginPath();
            ctx.moveTo(0, radius * 0.04);
            ctx.bezierCurveTo(-reach * 0.4, -reach * 0.3, -reach * 0.24, -reach * 0.78, 0, -reach);
            ctx.bezierCurveTo(reach * 0.28, -reach * 0.67, reach * 0.36, -reach * 0.25, 0, radius * 0.04);
            ctx.fill();
            ctx.restore();
        }
        ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#c2b579';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawLeaf(ctx: PondContext, pad: PositionedPad, lightAngle: number, palette: typeof POND_PALETTE) {
    const path = padPath(pad);
    ctx.fillStyle = '#03161b';
    ctx.shadowColor = 'rgba(0, 8, 14, 0.65)';
    ctx.shadowBlur = pad.radius * 0.16;
    ctx.shadowOffsetY = pad.radius * 0.09;
    ctx.fill(path);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const lightX = Math.cos(lightAngle) * pad.radius;
    const lightY = Math.sin(lightAngle) * pad.radius;
    const leaf = ctx.createLinearGradient(lightX, lightY, -lightX, -lightY);
    leaf.addColorStop(0, palette.leafLight);
    leaf.addColorStop(0.4, palette.leaf);
    leaf.addColorStop(1, '#1b3b35');
    ctx.fillStyle = leaf;
    ctx.fill(path);
    ctx.strokeStyle = 'rgba(135, 163, 129, 0.32)';
    ctx.lineWidth = Math.max(0.6, pad.radius * 0.018);
    ctx.stroke(path);
    ctx.save();
    ctx.clip(path);
    ctx.lineWidth = Math.max(0.4, pad.radius * 0.012);
    for (let i = 0; i < 12; i++) {
        const angle = 0.3 + i / 12 * (Math.PI * 2 - 0.5);
        const endX = Math.cos(angle) * pad.radius * 0.96;
        const endY = Math.sin(angle) * pad.radius * 0.96;
        ctx.strokeStyle = 'rgba(132, 158, 119, 0.22)';
        ctx.beginPath();
        ctx.moveTo(-pad.radius * 0.06, 0);
        ctx.quadraticCurveTo(endX * 0.4 - endY * 0.06, endY * 0.4 + endX * 0.06, endX, endY);
        ctx.stroke();
        for (let branch = 1; branch <= 3; branch++) {
            const fraction = branch * 0.23;
            ctx.strokeStyle = 'rgba(106, 146, 108, 0.13)';
            ctx.beginPath();
            ctx.moveTo(endX * fraction, endY * fraction);
            ctx.quadraticCurveTo(endX * (fraction + 0.13) - endY * 0.08, endY * (fraction + 0.13) + endX * 0.08,
                endX * (fraction + 0.25) - endY * 0.14, endY * (fraction + 0.25) + endX * 0.14);
            ctx.stroke();
        }
    }
    for (let i = 0; i < 14; i++) {
        const angle = sceneRandom(Math.floor(pad.phase * 10000), i) * Math.PI * 2;
        const reach = Math.sqrt(sceneRandom(Math.floor(pad.phase * 10000), i + 20)) * pad.radius * 0.8;
        ctx.fillStyle = 'rgba(166, 190, 172, 0.23)';
        ctx.beginPath();
        ctx.ellipse(Math.cos(angle) * reach, Math.sin(angle) * reach, pad.radius * 0.014, pad.radius * 0.008, -0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function makeSprite(radius: number, density: number, draw: (ctx: PondContext) => void) {
    const extent = Math.ceil(radius * 1.5);
    const size = Math.ceil(extent * 2 * density);
    const canvas = typeof OffscreenCanvas === 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(size, size);
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d') as PondContext;
    ctx.setTransform(size / (extent * 2), 0, 0, size / (extent * 2), size / 2, size / 2);
    draw(ctx);
    return {canvas, extent};
}

type Sprite = ReturnType<typeof makeSprite>;

export function createPadRenderer() {
    const cache: {key: string; lightAngle: number; leaf: Sprite; flower?: Sprite}[] = [];
    const release = (entry: typeof cache[number]) => {
        entry.leaf.canvas.width = entry.leaf.canvas.height = 1;
        if (entry.flower) entry.flower.canvas.width = entry.flower.canvas.height = 1;
    };
    return {
        dispose() {
            cache.forEach(release);
            cache.length = 0;
        },
        draw(ctx: PondContext, pads: PositionedPad[], drops: Drop[], time: number, width: number, height: number, palette: typeof POND_PALETTE) {
            const scale = Math.min(width, height);
            const density = Math.max(1, Math.min(2, ctx.canvas.width / width));
            const poses = pads.map(pad => {
                const slope = surfaceSlope(pad.x, pad.y, time, drops, scale);
                return {y: pad.y + pad.bob + slope.y * scale * 0.07, scaleY: 0.82 + slope.y * 0.18, angle: pad.angle + slope.x * 0.15};
            });
            const paint = (sprite: Sprite, index: number) => {
                const pose = poses[index];
                ctx.save();
                ctx.translate(pads[index].x, pose.y);
                ctx.scale(1, pose.scaleY);
                ctx.rotate(pose.angle);
                ctx.drawImage(sprite.canvas, -sprite.extent, -sprite.extent, sprite.extent * 2, sprite.extent * 2);
                ctx.restore();
            };
            pads.forEach((pad, i) => {
                const lightAngle = Math.atan2(height * 0.275 - pad.y, width * 0.65 - pad.x) - pad.angle;
                const key = `${pad.radius}:${pad.phase}:${pad.flower}:${density}:${palette.leaf}:${palette.leafLight}:${palette.flower}`;
                const entry = cache[i];
                const lightChange = entry ? Math.atan2(Math.sin(lightAngle - entry.lightAngle), Math.cos(lightAngle - entry.lightAngle)) : 0;
                if (!entry || entry.key !== key || Math.abs(lightChange) > 0.04) {
                    if (entry) release(entry);
                    cache[i] = {
                        key, lightAngle,
                        leaf: makeSprite(pad.radius, density, sprite => drawLeaf(sprite, pad, lightAngle, palette)),
                        flower: pad.flower ? makeSprite(pad.radius, density, sprite => drawFlower(sprite, pad.radius, pad.phase, palette.flower)) : undefined,
                    };
                }
                paint(cache[i].leaf, i);
            });
            // Keep flowers above all leaves, including leaves from neighboring pads.
            pads.forEach((_, i) => {
                const flower = cache[i].flower;
                if (flower) paint(flower, i);
            });
        },
    };
}

export function drawSplashes(ctx: PondContext, drops: Drop[], scale: number) {
    ctx.save();
    for (const drop of drops) {
        if (drop.age > 0.45) continue;
        const progress = drop.age / 0.45;
        ctx.globalAlpha = Math.sin(Math.PI * progress) * (drop.onPad >= 0 ? 0.45 : 0.3);
        ctx.fillStyle = '#adc7c5';
        for (let i = 0; i < 4; i++) {
            const angle = i / 4 * Math.PI * 2 + drop.strength * 5;
            const distance = progress * scale * 0.009;
            const lift = Math.sin(progress * Math.PI) * scale * 0.008;
            ctx.beginPath();
            ctx.ellipse(drop.x + Math.cos(angle) * distance, drop.y + Math.sin(angle) * distance * 0.6 - lift,
                Math.max(0.45, scale * 0.0009) * (1 - progress * 0.6), Math.max(0.6, scale * 0.0012) * (1 - progress * 0.6), 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}
