import {sceneRandom} from '../shared/scenery';
import type {ShrinePalette} from './palette';

export function drawPine(ctx: CanvasRenderingContext2D, x: number, base: number, height: number, seed: number, color: string, time: number) {
    const random = (i: number) => sceneRandom(seed, i);
    ctx.save(); ctx.translate(x, base); ctx.scale(height / 200, height / 200);
    const lean = (random(1) - 0.5) * 55;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.bezierCurveTo(17, -64, lean - 22, -120, lean, -183); ctx.stroke();

    const crown = (cx: number, cy: number, radius: number, index: number) => {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(cx - radius, cy + 2);
        for (let tuft = 0; tuft < 10; tuft++) {
            const left = cx - radius + tuft * radius / 5;
            const right = left + radius / 5;
            const arch = Math.sin((tuft + 0.5) / 10 * Math.PI);
            const top = cy - arch * radius * 0.33 - random(index * 20 + tuft + 100) * 4;
            ctx.quadraticCurveTo(left + radius / 10, top - 5, right, top + 3);
        }
        ctx.quadraticCurveTo(cx + radius * 0.6, cy + 7, cx, cy + 5);
        ctx.quadraticCurveTo(cx - radius * 0.6, cy + 9, cx - radius, cy + 2);
        ctx.fill();
    };

    for (let branch = 0; branch < 5; branch++) {
        const side = (branch % 2 ? -1 : 1) * (random(2) > 0.5 ? 1 : -1);
        const y = -70 - branch * 23;
        const root = lean * (branch + 1) / 6;
        const end = root + side * (54 - branch * 5) * (0.7 + random(branch + 10) * 0.55);
        const lift = 8 + random(branch + 20) * 13;
        const sway = Math.sin(time * 0.35 + branch + seed % 7) * 0.8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4.5 - branch * 0.55;
        ctx.beginPath(); ctx.moveTo(root, y + 24); ctx.quadraticCurveTo(end * 0.7, y + 21, end, y - lift + sway); ctx.stroke();
        crown(end, y - lift + sway, 38 - branch * 2 + random(branch + 30) * 14, branch);
        if (branch === 1 || branch === 3) crown(root - side * 12, y + 3, 26, branch + 8);
    }
    crown(lean, -183, 35, 18);
    ctx.strokeStyle = '#adad871f';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6, -7); ctx.bezierCurveTo(10, -60, lean - 21, -117, lean - 3, -166); ctx.stroke();
    ctx.restore();
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
