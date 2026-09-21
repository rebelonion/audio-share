import {TORII_FOOT} from './approach';
import type {ShrinePalette} from './palette';

type Point = readonly [number, number];

function polygon(ctx: CanvasRenderingContext2D, color: string, points: Point[]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
}

export function lanternGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
    const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
    light.addColorStop(0, color);
    light.addColorStop(1, 'transparent');
    ctx.fillStyle = light;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

// Local coordinates keep roof tiles and timber proportions consistent at every depth.
function tiledRoof(ctx: CanvasRenderingContext2D, width: number, ridge: number, eave: number, p: ShrinePalette) {
    const half = width / 2;
    ctx.fillStyle = p.roof;
    ctx.beginPath();
    ctx.moveTo(-half * 0.46, ridge);
    ctx.lineTo(half * 0.46, ridge);
    ctx.quadraticCurveTo(half * 0.72, eave - 12, half, eave - 7);
    ctx.lineTo(half + 4, eave - 12);
    ctx.lineTo(half + 3, eave + 2);
    ctx.quadraticCurveTo(0, eave + 14, -half - 3, eave + 2);
    ctx.lineTo(-half - 4, eave - 12);
    ctx.lineTo(-half, eave - 7);
    ctx.quadraticCurveTo(-half * 0.72, eave - 12, -half * 0.46, ridge);
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = p.roofLight;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 0.8;
    for (let x = -half; x <= half; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x * 0.46, ridge + 2);
        ctx.quadraticCurveTo(x * 0.65, eave - 12, x, eave + 6);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.15;
    for (let y = ridge + 8; y < eave; y += 8) {
        ctx.beginPath();
        ctx.moveTo(-half, y);
        ctx.quadraticCurveTo(0, y + 8, half, y);
        ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = p.roofLight;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-half - 2, eave + 1);
    ctx.quadraticCurveTo(0, eave + 13, half + 2, eave + 1);
    ctx.stroke();
    ctx.fillStyle = p.roofLight;
    ctx.fillRect(-half * 0.47, ridge - 4, half * 0.94, 4);
    ctx.fillStyle = p.roof;
    ctx.fillRect(-half * 0.49, ridge - 8, half * 0.98, 4);
}

export function drawShrine(ctx: CanvasRenderingContext2D, x: number, base: number, scale: number, p: ShrinePalette, variant: number) {
    ctx.save();
    ctx.translate(x, base);
    ctx.scale(scale, scale);
    const width = variant === 0 ? 218 : 170;
    const half = width / 2;
    const wallTop = -115;

    ctx.fillStyle = '#263831';
    ctx.fillRect(-half - 13, -14, width + 26, 14);
    ctx.fillStyle = p.stone;
    for (let step = 0; step < 3; step++) {
        ctx.fillRect(-43 - step * 7, -9 + step * 4, 86 + step * 14, 3);
    }
    ctx.fillStyle = p.timber;
    ctx.fillRect(-half, wallTop, width, 92);
    ctx.fillStyle = '#2c302a';
    ctx.fillRect(-half + 7, wallTop + 6, width - 14, 13);

    const bays = variant === 0 ? 5 : 4;
    const bayWidth = (width - 24) / bays;
    for (let bay = 0; bay < bays; bay++) {
        const bx = -half + 12 + bay * bayWidth;
        const isDoor = bay === Math.floor(bays / 2);
        const paper = ctx.createLinearGradient(0, -96, 0, -39);
        paper.addColorStop(0, '#a9855a');
        paper.addColorStop(1, isDoor ? p.lantern : '#d0b480');
        ctx.fillStyle = paper;
        ctx.fillRect(bx, -96, bayWidth - 5, 54);
        ctx.strokeStyle = '#554839';
        ctx.lineWidth = 1.3;
        for (let bar = 1; bar < 4; bar++) {
            const xx = bx + (bayWidth - 5) * bar / 4;
            ctx.beginPath(); ctx.moveTo(xx, -96); ctx.lineTo(xx, -42); ctx.stroke();
        }
        for (let yy = -85; yy < -43; yy += 12) {
            ctx.beginPath(); ctx.moveTo(bx, yy); ctx.lineTo(bx + bayWidth - 5, yy); ctx.stroke();
        }
    }
    ctx.fillStyle = '#a57a54';
    ctx.fillRect(-half - 8, -24, width + 16, 4);
    ctx.fillStyle = '#453d30';
    ctx.fillRect(-half - 8, -20, width + 16, 5);
    for (let post = 0; post <= bays; post++) {
        const px = -half + 7 + post * (width - 14) / bays;
        ctx.fillStyle = p.timber;
        ctx.fillRect(px - 3, wallTop - 7, 6, 99);
        ctx.fillStyle = '#bb886048';
        ctx.fillRect(px - 3, wallTop - 3, 1.5, 91);
        ctx.fillStyle = '#29342e';
        ctx.fillRect(px - 5, wallTop - 9, 10, 7);
    }
    tiledRoof(ctx, width + 72, -174, wallTop - 8, p);

    if (variant === 0) {
        polygon(ctx, p.timber, [[-49, -117], [0, -161], [49, -117]]);
        polygon(ctx, '#c5ac87', [[-32, -126], [0, -150], [32, -126]]);
        ctx.strokeStyle = p.timber;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, -149); ctx.lineTo(0, -125); ctx.stroke();
        ctx.strokeStyle = p.roof;
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(-58, -112); ctx.quadraticCurveTo(-27, -131, 0, -161); ctx.quadraticCurveTo(27, -131, 58, -112); ctx.stroke();
        ctx.strokeStyle = p.roofLight;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    for (const side of [-1, 1]) {
        const lx = side * (half - 5);
        ctx.fillStyle = p.lantern;
        ctx.beginPath(); ctx.ellipse(lx, -77, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#47392b';
        ctx.fillRect(lx - 4, -87, 8, 2);
        ctx.fillRect(lx - 4, -69, 8, 2);
        ctx.save(); ctx.globalAlpha = 0.12; lanternGlow(ctx, lx, -77, 28, p.lantern); ctx.restore();
    }
    ctx.restore();
}

export function drawTorii(ctx: CanvasRenderingContext2D, x: number, base: number, scale: number, p: ShrinePalette, time: number) {
    ctx.save();
    ctx.translate(x, base);
    ctx.scale(scale, scale);
    for (const side of [-1, 1]) {
        polygon(ctx, p.vermilion, [[side * 57 - 8, -4], [side * 49 - 7, -205], [side * 49 + 7, -205], [side * 57 + 8, -4]]);
        ctx.strokeStyle = '#e8a27165';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(side * 57 - 4, -25); ctx.lineTo(side * 49 - 3, -198); ctx.stroke();
        ctx.fillStyle = '#273931';
        ctx.fillRect(side * 57 - 10, -20, 20, 20);
        ctx.fillStyle = p.stone;
        ctx.fillRect(side * TORII_FOOT.offset - TORII_FOOT.halfWidth, -TORII_FOOT.back, TORII_FOOT.halfWidth * 2, TORII_FOOT.back + TORII_FOOT.front);
    }
    ctx.fillStyle = p.vermilion;
    ctx.fillRect(-78, -168, 156, 11);
    ctx.fillStyle = '#713e32';
    ctx.fillRect(-78, -159, 156, 3);
    ctx.fillStyle = '#d9885d';
    ctx.fillRect(-79, -169, 158, 2);
    ctx.fillStyle = p.vermilion;
    ctx.fillRect(-6, -204, 12, 44);

    ctx.beginPath();
    ctx.moveTo(-106, -216);
    ctx.quadraticCurveTo(0, -195, 106, -216);
    ctx.lineTo(103, -202);
    ctx.quadraticCurveTo(0, -184, -103, -202);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#283631';
    ctx.beginPath();
    ctx.moveTo(-114, -227);
    ctx.quadraticCurveTo(0, -203, 114, -227);
    ctx.lineTo(110, -216);
    ctx.quadraticCurveTo(0, -194, -110, -216);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a68a64';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-112, -226); ctx.quadraticCurveTo(0, -202, 112, -226); ctx.stroke();
    ctx.fillStyle = '#b38d58';
    ctx.fillRect(-10, -193, 20, 28);
    ctx.fillStyle = '#283833';
    ctx.fillRect(-8, -191, 16, 24);
    ctx.fillStyle = '#ccb17b';
    ctx.fillRect(-1, -186, 2, 13);

    ctx.strokeStyle = '#b4a37b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-47, -151); ctx.quadraticCurveTo(0, -137, 47, -151); ctx.stroke();
    for (let i = 0; i < 4; i++) {
        const px = -31 + i * 21;
        const py = -145 + (i === 1 || i === 2 ? 3 : 0);
        const sway = Math.sin(time * 0.7 + i) * 1.3;
        polygon(ctx, '#e1d9c0', [[px, py], [px + 5, py + 3], [px + 1 + sway, py + 8], [px + 5 + sway, py + 11], [px + sway, py + 18], [px - 1, py + 9], [px + 1, py + 6], [px - 2, py + 3]]);
    }
    ctx.restore();
}

export function drawStoneLantern(ctx: CanvasRenderingContext2D, x: number, base: number, scale: number, p: ShrinePalette) {
    ctx.save(); ctx.translate(x, base); ctx.scale(scale, scale);
    ctx.save(); ctx.globalAlpha = 0.12; lanternGlow(ctx, 0, -54, 40, p.lantern); ctx.restore();
    polygon(ctx, p.stone, [[-14, 0], [-12, -5], [-6, -9], [-5, -41], [5, -41], [6, -9], [12, -5], [14, 0]]);
    polygon(ctx, '#3e5146', [[-5, -9], [-4, -41], [0, -41], [0, -8]]);
    ctx.fillStyle = p.stone;
    ctx.fillRect(-12, -65, 24, 24);
    ctx.fillStyle = p.lantern;
    ctx.fillRect(-7, -60, 14, 13);
    ctx.fillStyle = '#3e4a3e';
    ctx.fillRect(-1, -61, 2, 15);
    polygon(ctx, '#4c5e50', [[-22, -65], [-12, -71], [-3, -80], [3, -80], [12, -71], [22, -65], [21, -62], [-21, -62]]);
    ctx.strokeStyle = '#9a9e86'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-21, -65); ctx.quadraticCurveTo(0, -68, 21, -65); ctx.stroke();
    ctx.fillStyle = p.stone;
    ctx.beginPath(); ctx.arc(0, -81, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}
