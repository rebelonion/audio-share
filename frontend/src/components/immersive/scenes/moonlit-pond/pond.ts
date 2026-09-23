import {sceneRandom, sceneSeed, smoothWaveform} from '../shared/scenery';
import {dominantArtworkHue} from '../shared/artworkPalette';

export const POND_PALETTE = {
    deep: '#07171e', water: '#15383d', edge: '#091f25', leaf: '#31554c',
    leafLight: '#527567', flower: '#dfcbd5', accent: '#b7ceca',
};

export function pondPaletteFromPixels(pixels: Uint8ClampedArray): typeof POND_PALETTE {
    const hue = dominantArtworkHue(pixels);
    return hue === null ? POND_PALETTE : {
        ...POND_PALETTE, flower: `hsl(${hue} 28% 80%)`, accent: `hsl(${hue} 24% 77%)`,
    };
}

export interface Pad {
    x: number;
    y: number;
    radius: number;
    angle: number;
    phase: number;
    flower: boolean;
}

export function createPond(key: string, peaks: Uint8Array | null, palette = POND_PALETTE) {
    const seed = sceneSeed(key);
    const random = (i: number) => sceneRandom(seed, i);
    const pads: Pad[] = [];
    const clusters = [{x: 0.13, y: 0.26, count: 7}, {x: 0.84, y: 0.77, count: 8}, {x: 0.04, y: 0.84, count: 4}];
    for (let c = 0; c < clusters.length; c++) {
        const cluster = clusters[c];
        for (let i = 0; i < cluster.count; i++) {
            const index = c * 50 + i * 5;
            const angle = i * 2.4 + random(index) * 0.3;
            const reach = i === 0 ? 0 : 0.04 + Math.sqrt(i) * 0.033;
            pads.push({
                x: cluster.x + Math.cos(angle) * reach,
                y: cluster.y + Math.sin(angle) * reach * 0.78,
                radius: 0.031 + random(index + 1) * 0.025,
                angle: random(index + 2) * Math.PI * 2,
                phase: random(index + 3) * Math.PI * 2,
                flower: i === 0 && c < 2,
            });
        }
    }
    const fish = Array.from({length: 6}, (_, i) => ({
        phase: random(500 + i * 7) * Math.PI * 2,
        centerX: 0.32 + random(501 + i * 7) * 0.33,
        centerY: 0.39 + random(502 + i * 7) * 0.27,
        radiusX: 0.19 + random(503 + i * 7) * 0.09,
        radiusY: 0.17 + random(504 + i * 7) * 0.12,
        rate: (0.022 + random(505 + i * 7) * 0.012) * (i % 2 ? -1 : 1),
        size: 0.9 + random(506 + i * 7) * 0.24,
        depth: 0.18 + i * 0.11,
        pattern: i % 3,
        seed: sceneSeed(`${key}:koi:${i}`),
    }));
    const samples = new Uint8Array(64);
    if (peaks?.length) {
        for (let i = 0; i < samples.length; i++) samples[i] = peaks[Math.floor(i * peaks.length / samples.length)];
    }
    return {seed, pads, fish, palette, shimmer: smoothWaveform(samples, 5)};
}

export type Pond = ReturnType<typeof createPond>;
export type Fish = Pond['fish'][number];
export interface Point {x: number; y: number}
export interface PositionedPad extends Pad {x: number; y: number; radius: number; bob: number}
export interface Drop extends Point {age: number; strength: number; onPad: number}
export const DROP_COUNT = 16;
export const DROP_LIFETIME = 3.8;
export const RAIN_SPEED = 0.06;
export const RAIN_FREQUENCY = 390;
export const RAIN_AMPLITUDE = 0.00017;

export function pondScale(width: number, height: number): number {
    return Math.sqrt(width * height);
}

export function positionPads(pads: Pad[], time: number, width: number, height: number): PositionedPad[] {
    const scale = pondScale(width, height);
    return pads.map(pad => ({...pad,
        x: pad.x * width + Math.sin(time * 0.12 + pad.phase) * scale * 0.002,
        y: pad.y * height + Math.cos(time * 0.1 + pad.phase) * scale * 0.0015,
        radius: pad.radius * scale,
        angle: pad.angle + Math.sin(time * 0.08 + pad.phase) * 0.035,
        bob: Math.sin(time * 0.7 + pad.phase) * 0.4,
    }));
}

export function padContains(pad: PositionedPad, x: number, y: number): boolean {
    const dx = x - pad.x;
    const dy = (y - pad.y) / 0.82;
    const cos = Math.cos(pad.angle);
    const sin = Math.sin(pad.angle);
    const px = dx * cos + dy * sin;
    const py = -dx * sin + dy * cos;
    const angle = Math.atan2(py, px);
    const radius = pad.radius * (1 + Math.sin(angle * 5 + pad.phase) * 0.035 + Math.sin(angle * 9) * 0.012);
    return Math.hypot(px, py) <= radius && !(px > 0 && Math.abs(angle) < 0.19);
}

export function rainDrops(seed: number, time: number, width: number, height: number, pads: Pad[]): Drop[] {
    const result: Drop[] = [];
    for (let i = 0; i < DROP_COUNT; i++) {
        const period = 6.2 + sceneRandom(seed, 800 + i) * 3.8;
        const shifted = time + sceneRandom(seed, 850 + i) * period;
        const cycle = Math.floor(shifted / period);
        const age = shifted - cycle * period;
        if (age > DROP_LIFETIME) continue;
        const eventSeed = seed ^ Math.imul(cycle + 1, 73471) ^ Math.imul(i + 1, 19391);
        const x = (0.035 + sceneRandom(eventSeed, 1) * 0.93) * width;
        const y = (0.08 + sceneRandom(eventSeed, 2) * 0.85) * height;
        // Classify at impact time, so a drifting pad cannot turn an existing splash into a water ring.
        const atImpact = positionPads(pads, time - age, width, height);
        let onPad = -1;
        for (let pad = atImpact.length - 1; pad >= 0; pad--) {
            if (padContains(atImpact[pad], x, y)) { onPad = pad; break; }
        }
        result.push({x, y, age, strength: 0.6 + sceneRandom(eventSeed, 3) * 0.6, onPad});
    }
    return result;
}

export function swellSlope(x: number, y: number, time: number, scale: number): Point {
    const px = x / scale;
    const py = y / scale;
    const dx = Math.sin(py * 104 + Math.sin(px * 19) * 1.4 - time * 0.49) * 0.003
        + Math.sin(py * 193 - px * 27 + time * 0.37) * 0.0015
        + Math.cos(px * 15 + py * 9 + time * 0.31) * 0.0028
        + Math.cos(px * 29 - py * 17 - time * 0.23) * 0.0012;
    const dy = Math.sin(py * 81 + px * 13 - time * 0.36) * 0.002
        + Math.cos(px * 15 + py * 9 + time * 0.31) * 0.0017
        - Math.cos(px * 29 - py * 17 - time * 0.23) * 0.0007;
    return {x: dx, y: dy};
}

export function surfaceSlope(x: number, y: number, time: number, drops: Drop[], scale: number): Point {
    const swell = swellSlope(x, y, time, scale);
    let dx = swell.x;
    let dy = swell.y;
    for (const drop of drops) {
        if (drop.onPad >= 0) continue;
        const rx = (x - drop.x) / scale;
        const ry = (y - drop.y) / scale / 0.82;
        const distance = Math.hypot(rx, ry);
        const width = 0.012 + drop.age * 0.006;
        const offset = distance - drop.age * RAIN_SPEED;
        if (Math.abs(offset) > width * 3 || distance < 0.0001) continue;
        const phase = distance * RAIN_FREQUENCY - drop.age * RAIN_FREQUENCY * RAIN_SPEED;
        const envelope = Math.exp(-offset * offset / (width * width)) * Math.exp(-drop.age * 0.9)
            * Math.min(1, drop.age / 0.07) * Math.min(1, (DROP_LIFETIME - drop.age) / 0.6) * drop.strength;
        const slope = RAIN_AMPLITUDE * envelope * (RAIN_FREQUENCY * Math.cos(phase)
            - 2 * offset / (width * width) * Math.sin(phase));
        dx += slope * rx / distance;
        dy += slope * ry / distance / 0.82;
    }
    return {x: dx, y: dy};
}

export function padPose(pad: PositionedPad, time: number, drops: Drop[], scale: number) {
    const slope = swellSlope(pad.x, pad.y, time, scale);
    let lift = 0;
    let rock = 0;
    for (const drop of drops) {
        if (drop.onPad >= 0) continue;
        const distance = Math.hypot(pad.x - drop.x, (pad.y - drop.y) / 0.82) / scale;
        const offset = distance - drop.age * RAIN_SPEED;
        // A floating leaf responds across its footprint, not to each sharp ripple crest.
        const width = 0.018 + pad.radius / scale * 0.5 + drop.age * 0.006;
        const fade = Math.max(0, Math.min(1, drop.age / 0.4, (DROP_LIFETIME - drop.age) / 0.6));
        const response = Math.exp(-offset * offset / (width * width) - drop.age * 0.55)
            * fade * fade * (3 - 2 * fade) * drop.strength;
        lift += response;
        rock += response * offset / width * (pad.x - drop.x) / (scale * Math.max(distance, 0.001));
    }
    return {
        y: pad.y + pad.bob + slope.y * scale * 0.07 - Math.tanh(lift) * Math.min(4, scale * 0.008),
        scaleY: 0.82 + slope.y * 0.18,
        angle: pad.angle + slope.x * 0.15 + Math.tanh(rock) * 0.045,
    };
}

export function fishPose(fish: Fish, time: number, width: number, height: number) {
    const travelPhase = (t: number) => t * fish.rate + fish.phase + Math.sin(t * 0.62 + fish.phase) * fish.rate * 0.35;
    const phase = travelPhase(time);
    const path = (p: number) => ({
        x: (fish.centerX + Math.cos(p) * fish.radiusX + Math.sin(p * 2 + fish.phase) * 0.026) * width,
        y: (fish.centerY + Math.sin(p) * fish.radiusY + Math.sin(p * 3 + fish.phase) * 0.018) * height,
    });
    const position = path(phase);
    const before = path(travelPhase(time - 0.2));
    const after = path(travelPhase(time + 0.2));
    const vx = after.x - before.x;
    const vy = after.y - before.y;
    const heading = Math.atan2(vy, vx);
    const next = path(travelPhase(time + 0.4));
    const turn = Math.atan2(Math.sin(Math.atan2(next.y - position.y, next.x - position.x) - heading),
        Math.cos(Math.atan2(next.y - position.y, next.x - position.x) - heading));
    const speed = Math.hypot(vx, vy) / 0.4;
    const length = pondScale(width, height) * 0.118 * fish.size;
    const stroke = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(time * 0.62 + fish.phase));
    return {...position, heading, turn, speed, length, stroke,
        tailPhase: time * (2.8 + Math.abs(fish.rate) * 22) + fish.phase,
        depth: fish.depth + Math.sin(phase * 2) * 0.06,
    };
}

export const pondSpan = () => 120;
export const pondSeek = (time: number) => time;
