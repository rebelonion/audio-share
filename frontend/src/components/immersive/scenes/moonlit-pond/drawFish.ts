import type {PondContext} from './pondCanvas';
import {sceneRandom} from '../shared/scenery';
import {fishPose, swellSlope, type Fish} from './pond';

export function drawFish(ctx: PondContext, fish: Fish, time: number, width: number, height: number) {
    const pose = fishPose(fish, time, width, height);
    const scale = Math.min(width, height);
    // A local rain crest must not translate the entire fish as a rigid body.
    const refraction = swellSlope(pose.x, pose.y, time, scale);
    const length = pose.length;
    const bend = (s: number) => Math.sin(s * 5.4 - pose.tailPhase) * length * 0.075 * s * s * pose.stroke
        + pose.turn * length * s * s * 5;
    const girth = (s: number) => length * (0.008 + Math.pow(Math.sin(Math.PI * Math.pow(0.025 + s * 0.975, 0.58)), 0.85) * 0.097);
    ctx.save();
    ctx.translate(pose.x + refraction.x * scale * 0.14, pose.y + refraction.y * scale * 0.14);
    ctx.rotate(pose.heading);
    ctx.globalAlpha = 0.83 - pose.depth * 0.4;
    const finColor = fish.pattern === 1 ? '#8d9a7a' : '#9bac9f';
    // Paired pectoral fins open during a stroke and relax during a glide.
    for (const side of [-1, 1]) {
        const scull = 0.75 + Math.sin(pose.tailPhase * 0.66 + side * 0.55) * 0.2;
        ctx.fillStyle = finColor;
        ctx.globalAlpha *= 0.52;
        ctx.beginPath();
        ctx.moveTo(-length * 0.24, side * length * 0.074);
        ctx.bezierCurveTo(-length * 0.19, side * length * 0.18 * scull, -length * 0.35, side * length * 0.23 * scull, -length * 0.39, side * length * 0.15 * scull);
        ctx.quadraticCurveTo(-length * 0.36, side * length * 0.08, -length * 0.3, side * length * 0.055);
        ctx.fill();
        ctx.strokeStyle = '#c3c8ab';
        ctx.lineWidth = Math.max(0.4, length * 0.006);
        ctx.beginPath();
        ctx.moveTo(-length * 0.25, side * length * 0.08);
        ctx.lineTo(-length * 0.34, side * length * 0.19 * scull);
        ctx.stroke();
        ctx.globalAlpha = 0.83 - pose.depth * 0.4;
    }
    const tailY = bend(1);
    const tailTip = Math.sin(6.15 - pose.tailPhase) * length * 0.115 * pose.stroke + pose.turn * length * 6.4;
    const tailSweep = tailTip - tailY;
    ctx.fillStyle = finColor;
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    ctx.moveTo(-length * 0.91, bend(0.91));
    ctx.bezierCurveTo(-length * 1.02, tailY - length * 0.03, -length * 1.1, tailY - length * 0.15 + tailSweep, -length * 1.13, tailY - length * 0.135 + tailSweep);
    ctx.quadraticCurveTo(-length * 1.07, tailY + tailSweep, -length * 1.13, tailY + length * 0.135 + tailSweep);
    ctx.bezierCurveTo(-length * 1.07, tailY + length * 0.13 + tailSweep, -length, tailY + length * 0.025, -length * 0.91, bend(0.91));
    ctx.fill();
    ctx.strokeStyle = '#c5cbb8';
    ctx.lineWidth = Math.max(0.35, length * 0.004);
    for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-length * 0.95, bend(0.95));
        ctx.quadraticCurveTo(-length * 1.03, tailY + i * length * 0.025, -length * 1.105, tailY + i * length * 0.055 + tailSweep);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.83 - pose.depth * 0.4;
    const body = new Path2D();
    for (let i = 0; i <= 28; i++) {
        const s = i / 28;
        const x = -s * length;
        const y = bend(s) - girth(s);
        if (i === 0) body.moveTo(x, y); else body.lineTo(x, y);
    }
    for (let i = 28; i >= 0; i--) {
        const s = i / 28;
        body.lineTo(-s * length, bend(s) + girth(s));
    }
    body.quadraticCurveTo(length * 0.022, 0, 0, -girth(0));
    body.closePath();
    const bodyColor = ctx.createLinearGradient(0, -length * 0.12, 0, length * 0.12);
    bodyColor.addColorStop(0, fish.pattern === 1 ? '#7d855d' : '#7f9993');
    bodyColor.addColorStop(0.4, fish.pattern === 1 ? '#c8b175' : '#d5d5b9');
    bodyColor.addColorStop(0.7, fish.pattern === 1 ? '#ae8c50' : '#afb9a3');
    bodyColor.addColorStop(1, '#526d69');
    ctx.fillStyle = bodyColor;
    ctx.shadowColor = 'rgba(0, 9, 16, 0.28)';
    ctx.shadowBlur = length * 0.15;
    ctx.shadowOffsetY = length * (0.09 + pose.depth * 0.05);
    ctx.fill(body);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.save();
    ctx.clip(body);
    const patchCount = fish.pattern === 1 ? 0 : fish.pattern === 2 ? 7 : 4;
    for (let i = 0; i < patchCount; i++) {
        const position = i < 4 ? 0.04 + i * 0.22 + sceneRandom(fish.seed, i) * 0.09
            : 0.16 + sceneRandom(fish.seed, i) * 0.68;
        const cx = -position * length;
        const cy = bend(position) + (sceneRandom(fish.seed, i + 20) - 0.5) * length * 0.07;
        const reach = length * (i < 4 ? 0.095 + sceneRandom(fish.seed, i + 40) * 0.045 : 0.04 + sceneRandom(fish.seed, i + 40) * 0.03);
        ctx.fillStyle = i >= 4 ? '#283c3b' : '#b76c48';
        const points = Array.from({length: 12}, (_, j) => {
            const angle = j / 12 * Math.PI * 2;
            const irregular = 0.65 + sceneRandom(fish.seed + i * 79, j) * 0.4;
            return {x: cx + Math.cos(angle) * reach * irregular, y: cy + Math.sin(angle) * reach * irregular};
        });
        ctx.beginPath();
        ctx.moveTo((points[11].x + points[0].x) / 2, (points[11].y + points[0].y) / 2);
        for (let j = 0; j < points.length; j++) {
            const p = points[j];
            const next = points[(j + 1) % points.length];
            ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
        }
        ctx.closePath();
        ctx.fill();
    }
    const rounding = ctx.createLinearGradient(0, -length * 0.11, 0, length * 0.11);
    rounding.addColorStop(0, 'rgba(7, 36, 39, 0.48)');
    rounding.addColorStop(0.35, 'rgba(224, 224, 187, 0.1)');
    rounding.addColorStop(0.55, 'rgba(224, 224, 187, 0.04)');
    rounding.addColorStop(1, 'rgba(7, 36, 39, 0.5)');
    ctx.fillStyle = rounding;
    ctx.fill(body);
    // Scales are quiet, broken rows that follow the bending body.
    ctx.strokeStyle = 'rgba(224, 221, 176, 0.15)';
    ctx.lineWidth = Math.max(0.35, length * 0.004);
    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 12; i++) {
            const s = 0.25 + i * 0.05 + (row % 2) * 0.02;
            const y = bend(s) + (row - 1) * girth(s) * 0.58;
            ctx.beginPath();
            ctx.arc(-s * length, y, length * 0.024, -0.8, 0.8);
            ctx.stroke();
        }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(204, 210, 178, 0.3)';
    ctx.lineWidth = Math.max(0.5, length * 0.011);
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
        const s = 0.32 + i / 12 * 0.38;
        const y = bend(s) - Math.sin(i / 12 * Math.PI) * length * 0.017;
        if (i === 0) ctx.moveTo(-s * length, y); else ctx.lineTo(-s * length, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(46, 65, 60, 0.55)';
    ctx.lineWidth = Math.max(0.6, length * 0.008);
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-length * 0.16, side * length * 0.025);
        ctx.quadraticCurveTo(-length * 0.23, side * length * 0.065, -length * 0.17, side * length * 0.085);
        ctx.stroke();
        ctx.fillStyle = '#172f30';
        ctx.beginPath();
        ctx.ellipse(-length * 0.055, side * length * 0.043, length * 0.012, length * 0.009, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
