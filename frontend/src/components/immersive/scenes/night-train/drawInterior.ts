import {clamp} from '@/lib/utils';
import type {NightTrainPalette} from './palette';

export function drawCarriageSeat(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number, colors: NightTrainPalette) {
    const seatWidth = Math.min(width * 0.52, clamp(width * 0.24, 200 * scale, 370 * scale));
    const top = height * 0.48;
    const base = height * 1.25 - top;

    ctx.save();
    ctx.translate(-12 * scale, top);
    ctx.fillStyle = '#151d27';
    ctx.beginPath();
    ctx.moveTo(0, 16 * scale);
    ctx.quadraticCurveTo(0, -3 * scale, seatWidth * 0.12, 0);
    ctx.quadraticCurveTo(seatWidth * 0.23, 0, seatWidth * 0.25, 22 * scale);
    ctx.lineTo(seatWidth * 0.41, base - 10 * scale);
    ctx.lineTo(seatWidth * 0.19, base + 25 * scale);
    ctx.closePath();
    ctx.fill();

    const back = new Path2D();
    back.moveTo(6 * scale, 17 * scale);
    back.quadraticCurveTo(6 * scale, 3 * scale, seatWidth * 0.12, 4 * scale);
    back.quadraticCurveTo(seatWidth * 0.2, 4 * scale, seatWidth * 0.21, 22 * scale);
    back.lineTo(seatWidth * 0.38, base);
    back.quadraticCurveTo(seatWidth * 0.34, base + 7 * scale, seatWidth * 0.24, base + 5 * scale);
    back.closePath();
    const upholstery = ctx.createLinearGradient(0, 0, seatWidth * 0.4, 0);
    upholstery.addColorStop(0, '#252b35');
    upholstery.addColorStop(0.55, colors.upholstery);
    upholstery.addColorStop(0.83, colors.upholsteryLight);
    upholstery.addColorStop(1, '#2a2b35');
    ctx.fillStyle = upholstery;
    ctx.fill(back);

    ctx.save();
    ctx.clip(back);
    ctx.strokeStyle = '#b4978126';
    ctx.lineWidth = scale * 0.6;
    ctx.beginPath();
    for (let y = 9 * scale; y < base; y += 6 * scale) {
        for (let x = 5 * scale; x < seatWidth * 0.4; x += 6 * scale) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + scale, y + 2 * scale);
        }
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = scale;
    ctx.beginPath();
    ctx.moveTo(seatWidth * 0.12, 8 * scale);
    ctx.quadraticCurveTo(seatWidth * 0.18, 8 * scale, seatWidth * 0.19, 24 * scale);
    ctx.lineTo(seatWidth * 0.35, base - 5 * scale);
    ctx.stroke();

    ctx.restore();
}
