import {sceneRandom} from '../shared/scenery';

export const FOG_LAYERS = [
    {depth: 0.08, y: 0.285, height: 0.17, opacity: 0.31, speed: 0.003, stretch: 1.2},
    {depth: 0.32, y: 0.405, height: 0.14, opacity: 0.165, speed: -0.004, stretch: 1.5},
    {depth: 0.62, y: 0.64, height: 0.17, opacity: 0.078, speed: 0.005, stretch: 1.8},
];

let texture: HTMLCanvasElement | null = null;

function noise(x: number, y: number, columns: number, rows: number, seed: number): number {
    const px = x * columns;
    const py = y * rows;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sample = (dx: number, dy: number) => sceneRandom(seed, (ix + dx) % columns + (iy + dy) * columns);
    const top = sample(0, 0) * (1 - sx) + sample(1, 0) * sx;
    const bottom = sample(0, 1) * (1 - sx) + sample(1, 1) * sx;
    return top * (1 - sy) + bottom * sy;
}

function fogTexture(): HTMLCanvasElement | null {
    if (texture) return texture;
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) {
        const v = y / (canvas.height - 1);
        for (let x = 0; x < canvas.width; x++) {
            const u = x / canvas.width;
            const bend = (noise(u, 0.5, 6, 2, 71) - 0.5) * 0.32;
            const envelope = Math.exp(-Math.pow((v - 0.5 + bend) / 0.24, 2)) * Math.pow(Math.sin(v * Math.PI), 2);
            const billow = noise(u, v, 9, 5, 103) * 0.57
                + noise(u, v, 23, 11, 197) * 0.29
                + noise(u, v, 51, 19, 307) * 0.14;
            const density = Math.max(0, (billow - 0.25) / 0.75);
            const offset = (y * canvas.width + x) * 4;
            pixels.data[offset] = 139;
            pixels.data[offset + 1] = 161;
            pixels.data[offset + 2] = 168;
            pixels.data[offset + 3] = Math.round(255 * envelope * density);
        }
    }
    ctx.putImageData(pixels, 0, 0);
    texture = canvas;
    return texture;
}

export function drawFog(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, seed: number, index: number) {
    const texture = fogTexture();
    if (!texture) return;
    const layer = FOG_LAYERS[index];
    ctx.save();
    // Two differently stretched sheets slide through one another, opening uneven gaps.
    for (let sheet = 0; sheet < 2; sheet++) {
        const span = Math.max(width, height * 0.95) * (layer.stretch + sheet * 0.37);
        const phase = time * layer.speed * (1 - sheet * 0.38) + sceneRandom(seed, index * 2 + sheet);
        const offset = ((phase % 1) + 1) % 1 * span;
        const lift = Math.sin(time * 0.07 + index * 2 + sheet) * height * 0.004;
        const thickness = Math.min(height, width * 1.5) * layer.height;
        const top = height * layer.y - thickness / 2 + sheet * thickness * 0.15 + lift;
        ctx.globalAlpha = layer.opacity * (sheet === 0 ? 1 : 0.55);
        for (let x = offset - span; x < width; x += span) {
            ctx.drawImage(texture, x, top, span, thickness);
        }
    }
    ctx.restore();
}
