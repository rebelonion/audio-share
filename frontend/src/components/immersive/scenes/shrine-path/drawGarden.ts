import {sceneRandom} from '../shared/scenery';
import type {ShrinePalette} from './palette';
import type {Foliage} from './foliage';
import {ArtworkCache} from '../shared/artworkCache';

const pineCache = new ArtworkCache();

// Palette transitions hand over blended `rgb()` strings every frame, even for colors that are not
// changing. Reducing hex and rgb alike to the same coarse rgb value keeps the cache key stable across
// a transition, and the step is fine enough that no one can see the rounding.
export function cacheColor(color: string): string {
    const channels = color.startsWith('#')
        ? (color.length === 4 ? [1, 2, 3].map(i => parseInt(color[i] + color[i], 16)) : [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)))
        : color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    return `rgb(${channels.map(value => Math.min(255, Math.round(value / 8) * 8)).join(', ')})`;
}

/** A garden pine trained into flat needle pads on a leaning trunk; snow foliage caps each pad. */
export function drawPine(ctx: CanvasRenderingContext2D, x: number, base: number, height: number, seed: number, paletteColor: string, time: number, foliage: Foliage = 'blossom') {
    const transform = ctx.getTransform();
    const resolution = Math.max(0.5, Math.min(3, Math.ceil(Math.hypot(transform.a, transform.b) * height / 200 * 2) / 2));
    const color = cacheColor(paletteColor);
    const snow = foliage === 'snow';
    const key = `${seed}:${color}:${snow}:${resolution}`;
    let artwork = pineCache.get(key);
    if (!artwork) {
        artwork = document.createElement('canvas');
        artwork.width = 300 * resolution;
        artwork.height = 250 * resolution;
        const brush = artwork.getContext('2d')!;
        brush.scale(resolution, resolution);
        brush.translate(150, 235);
        drawPineArtwork(brush, seed, color, snow);
        pineCache.set(key, artwork);
    }

    ctx.save();
    ctx.translate(x, base);
    ctx.scale(height / 200, height / 200);
    // A gentle shear from the roots stands in for the pads stirring in the breeze.
    ctx.transform(1, 0, Math.sin(time * 0.35 + seed % 7) * 0.005, 1, 0, 0);
    ctx.drawImage(artwork, -150, -235, 300, 250);
    ctx.restore();
}

function drawPineArtwork(ctx: CanvasRenderingContext2D, seed: number, color: string, snow: boolean) {
    const random = (i: number) => sceneRandom(seed, i);
    const lean = (random(1) - 0.5) * 55;
    const light = 'rgba(196, 222, 178, 0.3)';
    const dark = 'rgba(4, 16, 12, 0.42)';
    ctx.lineCap = 'round';

    // Trunk: a tapered stroke with a shaded side and a few bark ticks.
    const trunk = () => {
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.bezierCurveTo(17, -64, lean - 22, -120, lean, -183);
    };
    ctx.strokeStyle = color; ctx.lineWidth = 10; trunk(); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 3.5;
    ctx.save(); ctx.translate(3, 0); trunk(); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = '#adad8733'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-6, -7); ctx.bezierCurveTo(10, -60, lean - 21, -117, lean - 3, -166); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
        const t = 0.08 + i * 0.1;
        const u = 1 - t;
        const tx = u ** 3 * -4 + 3 * u * u * t * 17 + 3 * u * t * t * (lean - 22) + t ** 3 * lean;
        const ty = 3 * u * u * t * -64 + 3 * u * t * t * -120 + t ** 3 * -183;
        const tilt = (random(40 + i) - 0.5) * 1.6;
        ctx.beginPath(); ctx.moveTo(tx - 3, ty + tilt); ctx.lineTo(tx + 2, ty - tilt); ctx.stroke();
    }

    const tracePad = (cx: number, cy: number, radius: number, index: number) => {
        const tops: [number, number][] = [];
        ctx.beginPath(); ctx.moveTo(cx - radius, cy + 2);
        for (let tuft = 0; tuft < 10; tuft++) {
            const left = cx - radius + tuft * radius / 5;
            const right = left + radius / 5;
            const arch = Math.sin((tuft + 0.5) / 10 * Math.PI);
            const top = cy - arch * radius * 0.33 - random(index * 20 + tuft + 100) * 4;
            ctx.quadraticCurveTo(left + radius / 10, top - 5, right, top + 3);
            tops.push([left + radius / 10, top - 2]);
        }
        ctx.quadraticCurveTo(cx + radius * 0.6, cy + 7, cx, cy + 5);
        ctx.quadraticCurveTo(cx - radius * 0.6, cy + 9, cx - radius, cy + 2);
        ctx.closePath();
        return tops;
    };

    const pad = (cx: number, cy: number, radius: number, index: number) => {
        tracePad(cx, cy, radius, index);
        ctx.fillStyle = color; ctx.fill();
        const r = (n: number) => random(index * 977 + n + 2000);
        const crownAt = (px: number) => cy - Math.sin(Math.max(0, Math.min(1, (px - cx + radius) / (radius * 2))) * Math.PI) * radius * 0.33;
        ctx.save();
        tracePad(cx, cy, radius, index); ctx.clip();
        // Light falls on the crown and the underside sits in shadow, so the pad reads as a mass.
        const shade = ctx.createLinearGradient(0, cy - radius * 0.4, 0, cy + 8);
        shade.addColorStop(0, 'rgba(196, 222, 178, 0.2)');
        shade.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
        shade.addColorStop(1, 'rgba(4, 16, 12, 0.5)');
        ctx.fillStyle = shade;
        ctx.fillRect(cx - radius - 2, cy - radius * 0.45, radius * 2 + 4, radius * 0.5 + 14);
        // Needles: short strokes packed inside the pad, fanning outward from its centre.
        ctx.lineWidth = 0.7;
        const needles = Math.round(radius * 2.4);
        for (let n = 0; n < needles; n++) {
            const px = cx - radius + r(n * 5) * radius * 2;
            const top = crownAt(px);
            const depth = r(n * 5 + 1);
            const py = top + depth * (cy + 6 - top);
            const angle = (px - cx) / radius * 0.9 + (r(n * 5 + 2) - 0.5) * 0.7;
            const length = 2.5 + r(n * 5 + 3) * 3;
            ctx.strokeStyle = depth < 0.45 ? (n % 2 ? light : 'rgba(170, 205, 150, 0.16)') : dark;
            ctx.beginPath(); ctx.moveTo(px, py);
            ctx.lineTo(px + Math.sin(angle) * length, py - Math.cos(angle) * length);
            ctx.stroke();
        }
        ctx.restore();
        // A fine fringe just past the outline softens the silhouette without turning into grass.
        ctx.lineWidth = 0.8;
        for (let f = 0; f < radius; f++) {
            const px = cx - radius + (f + 0.5) / radius * radius * 2;
            const py = crownAt(px) - r(f * 3 + 900) * 3;
            const angle = (px - cx) / radius * 1.1 + (r(f * 3 + 901) - 0.5) * 0.5;
            const length = 1.2 + r(f * 3 + 902) * 1.8;
            ctx.strokeStyle = f % 3 ? color : light;
            ctx.beginPath(); ctx.moveTo(px, py + 1);
            ctx.lineTo(px + Math.sin(angle) * length, py + 1 - Math.cos(angle) * length);
            ctx.stroke();
        }
        if (snow) {
            // Snow lies as a mound on each pad: deepest over the middle, thinning to nothing at the tips,
            // with a cool shadow under its lip and a few needles showing through.
            const rs = (n: number) => r(n + 4000);
            const steps = Math.round(radius * 1.2);
            const top: [number, number][] = [];
            const bottom: [number, number][] = [];
            for (let i = 0; i <= steps; i++) {
                const u = i / steps;
                const px = cx - radius + u * radius * 2;
                const crown = crownAt(px);
                const scallop = Math.max(0, Math.sin(u * 10 * Math.PI));
                const fade = Math.pow(Math.sin(u * Math.PI), 0.7);
                const lift = 1 + fade * 2 + scallop * 2.5 + (rs(i) - 0.5) * 1.2;
                const depth = (1.5 + 5.5 * fade) * (0.8 + 0.2 * scallop) + (rs(i + 400) - 0.5) * 1.5;
                top.push([px, crown - lift]);
                bottom.push([px, crown - lift + depth]);
            }
            const snowTop = Math.min(...top.map(([, y]) => y));
            const snowBottom = Math.max(...bottom.map(([, y]) => y));
            const cap = ctx.createLinearGradient(0, snowTop, 0, snowBottom);
            cap.addColorStop(0, '#fbfcfd');
            cap.addColorStop(0.55, '#eef2f5');
            cap.addColorStop(1, '#c5d0d9');
            ctx.fillStyle = cap;
            ctx.beginPath();
            ctx.moveTo(top[0][0], top[0][1]);
            for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
            for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(96, 122, 142, 0.4)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(bottom[0][0], bottom[0][1]);
            for (let i = 1; i < bottom.length; i++) ctx.lineTo(bottom[i][0], bottom[i][1]);
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.8;
            for (let k = 0; k < radius / 5; k++) {
                const u = 0.12 + rs(k * 3 + 800) * 0.76;
                const i = Math.round(u * steps);
                const [px, py] = top[i];
                const tilt = (rs(k * 3 + 801) - 0.5) * 1.4;
                ctx.beginPath(); ctx.moveTo(px, py + 1.5); ctx.lineTo(px + tilt, py - 1.5 - rs(k * 3 + 802) * 1.5); ctx.stroke();
            }
        }
    };

    for (let branch = 0; branch < 5; branch++) {
        const side = (branch % 2 ? -1 : 1) * (random(2) > 0.5 ? 1 : -1);
        const y = -70 - branch * 23;
        const root = lean * (branch + 1) / 6;
        const end = root + side * (54 - branch * 5) * (0.7 + random(branch + 10) * 0.55);
        const lift = 8 + random(branch + 20) * 13;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4.5 - branch * 0.55;
        ctx.beginPath(); ctx.moveTo(root, y + 24); ctx.quadraticCurveTo(end * 0.7, y + 21, end, y - lift); ctx.stroke();
        ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(root, y + 26); ctx.quadraticCurveTo(end * 0.7, y + 23, end, y - lift + 2); ctx.stroke();
        pad(end, y - lift, 38 - branch * 2 + random(branch + 30) * 14, branch);
        if (branch === 1 || branch === 3) pad(root - side * 12, y + 3, 26, branch + 8);
    }
    pad(lean, -183, 35, 18);
}

export function drawGardenRocks(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seed: number, p: ShrinePalette) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    for (let i = 0; i < 4; i++) {
        const r = sceneRandom(seed, i);
        const bx = i * 15 - 20;
        const height = 8 + r * 16;
        ctx.fillStyle = i % 2 ? '#56675a' : p.stone;
        ctx.beginPath();
        ctx.moveTo(bx - 13, 0); ctx.lineTo(bx - 9, -height * 0.75); ctx.lineTo(bx - 1, -height);
        ctx.lineTo(bx + 8, -height * 0.83); ctx.lineTo(bx + 13, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = p.ground;
        ctx.beginPath(); ctx.ellipse(bx, -height * 0.1, 13, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}
