import type {DesertPalette} from './palette';
import type {Campsite} from './campsite';

const TENT_COLORS = [
    ['#aa795e', '#c69b73', '#744c426b'],
    ['#5b4140', '#806052', '#bd93746b'],
    ['#60565a', '#92827d', '#d1b39366'],
];

export function drawCamp(ctx: CanvasRenderingContext2D, x: number, base: number, scale: number, camp: Campsite, time: number, p: DesertPalette, audioLevel = 0) {
    ctx.save(); ctx.translate(x, base); ctx.scale(scale, scale);
    ctx.fillStyle = '#352e3430';
    const {left, right} = camp.bounds;
    ctx.beginPath(); ctx.ellipse((left + right) / 2, 10, (right - left) / 2, 14, 0, 0, Math.PI * 2); ctx.fill();
    for (const tent of camp.tents) {
        const {peak, size} = tent;
        const [sideColor, faceColor, stripeColor] = TENT_COLORS[tent.cloth];
        ctx.save(); ctx.translate(tent.x, tent.y); ctx.scale(size * tent.facing, size);
        ctx.strokeStyle = p.silhouette; ctx.lineWidth = 1;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 31, peak + 19); ctx.lineTo(side * 87, 6); ctx.stroke();
            ctx.fillStyle = p.silhouette; ctx.fillRect(side * 87 - 1, 2, 2, 9);
        }
        ctx.fillStyle = sideColor;
        ctx.beginPath(); ctx.moveTo(-71, 1); ctx.lineTo(-32, peak + 17);
        ctx.lineTo(25, peak); ctx.lineTo(67, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = faceColor;
        ctx.beginPath(); ctx.moveTo(-71, 1); ctx.lineTo(-32, peak + 17); ctx.lineTo(25, peak); ctx.lineTo(1, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = stripeColor; ctx.lineWidth = 3;
        if (tent.striped) {
            for (let panel = 1; panel < 5; panel++) {
                ctx.beginPath(); ctx.moveTo(-32 + panel * 11.4, peak + 17 - panel * 3.4);
                ctx.lineTo(-71 + panel * 14.4, 1); ctx.stroke();
            }
        }
        ctx.fillStyle = '#362e34';
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(25, peak + 13); ctx.lineTo(44, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e0ab7660';
        ctx.beginPath(); ctx.moveTo(19, -3); ctx.lineTo(25, peak + 31); ctx.lineTo(32, -3); ctx.fill();
        ctx.strokeStyle = p.stoneShadow; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(25, peak - 9); ctx.stroke();
        ctx.strokeStyle = '#dfb98d'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-71, 1); ctx.lineTo(-32, peak + 17); ctx.lineTo(25, peak); ctx.lineTo(67, 0); ctx.stroke();
        if (tent.awning) {
            ctx.strokeStyle = p.silhouette; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(106, -35); ctx.lineTo(132, 8); ctx.stroke();
            ctx.fillStyle = p.silhouette; ctx.fillRect(131, 5, 2, 6);
            ctx.fillStyle = faceColor;
            ctx.beginPath(); ctx.moveTo(39, -49); ctx.lineTo(106, -35);
            ctx.quadraticCurveTo(82, -28, 57, -31); ctx.lineTo(32, -39); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#d8b58a'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(39, -49); ctx.lineTo(106, -35); ctx.stroke();
            ctx.strokeStyle = p.stoneShadow; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(106, 3); ctx.lineTo(106, -39); ctx.moveTo(57, 2); ctx.lineTo(57, -31); ctx.stroke();
        }
        ctx.restore();
    }

    ctx.save(); ctx.translate(camp.fire.x, camp.fire.y);
    const glow = ctx.createRadialGradient(0, 7, 0, 0, 7, 42);
    glow.addColorStop(0, `rgba(239, 170, 87, ${0.259 + audioLevel * 0.4})`); glow.addColorStop(1, '#efaa5700');
    ctx.fillStyle = glow; ctx.fillRect(-42, -35, 84, 84);
    ctx.strokeStyle = '#443438'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(8, 5); ctx.moveTo(-7, 5); ctx.lineTo(7, 10); ctx.stroke();
    ctx.fillStyle = '#efb36d';
    ctx.beginPath(); ctx.moveTo(-5, 7);
    ctx.quadraticCurveTo(-8, 0, Math.sin(time * 3) * 2, -10 - Math.sin(time * 4) * 2 - audioLevel * 6);
    ctx.quadraticCurveTo(1, 0, 6, 7); ctx.fill();
    ctx.fillStyle = '#ffe1a0';
    ctx.beginPath(); ctx.ellipse(0, 4 - audioLevel * 1.5, 2.5, 5 + audioLevel * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
        const phase = (time * 0.12 + i / 3) % 1;
        ctx.globalAlpha = (1 - phase) * 0.08;
        ctx.fillStyle = p.horizon;
        ctx.beginPath(); ctx.ellipse(phase * 18, -12 - phase * 38, 3 + phase * 9, 5 + phase * 11, -0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    for (const {x: jx, y: jy, radius} of camp.supplies) {
        ctx.fillStyle = '#785142';
        ctx.beginPath(); ctx.ellipse(jx, jy - radius, radius, radius * 1.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c09166'; ctx.fillRect(jx - radius * 0.55, jy - radius * 2.3, radius * 1.1, 3);
    }
    ctx.restore();
}
