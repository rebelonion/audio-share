import {sceneRandom} from '../shared/scenery';

const styles = ['airy', 'layered', 'weeping'] as const;
type CherryStyle = typeof styles[number];
const artworkCache = new Map<string, HTMLCanvasElement>();

export function drawCherryTree(ctx: CanvasRenderingContext2D, x: number, base: number, height: number, seed: number, time: number, distant = false) {
    const transform = ctx.getTransform();
    const resolution = Math.max(0.5, Math.min(3, Math.ceil(Math.hypot(transform.a, transform.b) * height / 200 * 2) / 2));
    const key = `${seed}:${distant}:${resolution}`;
    let artwork = artworkCache.get(key);
    if (!artwork) {
        const style = styles[Math.floor(sceneRandom(seed, 6900) * styles.length)];
        artwork = document.createElement('canvas');
        artwork.width = 320 * resolution;
        artwork.height = 280 * resolution;
        const brush = artwork.getContext('2d')!;
        brush.scale(resolution, resolution);
        brush.translate(160, 270);
        drawTreeArtwork(brush, seed, style, distant);
    }
    // Keep recently visible trees without retaining the entire scrolling world.
    artworkCache.delete(key);
    artworkCache.set(key, artwork);
    if (artworkCache.size > 24) artworkCache.delete(artworkCache.keys().next().value!);

    ctx.save(); ctx.translate(x, base); ctx.scale(height / 200, height / 200);
    ctx.save();
    // Shear around the roots so the cached branches and trunk sway together.
    ctx.transform(1, 0, Math.sin(time * 0.5 + sceneRandom(seed, 7001) * 6) * 0.006, 1, 0, 0);
    ctx.drawImage(artwork, -160, -270, 320, 280);
    ctx.restore();
    if (!distant) {
        const r = (n: number) => sceneRandom(seed, n + 7000);
        ctx.scale(r(1) > 0.5 ? 1 : -1, 1);
        ctx.fillStyle = '#efc3cc';
        const opacity = ctx.globalAlpha;
        for (let i = 0; i < 8; i++) {
            const phase = (time * 0.04 + r(30000 + i)) % 1;
            ctx.globalAlpha = opacity * Math.sin(phase * Math.PI) * 0.7;
            ctx.beginPath();
            ctx.ellipse((r(30100 + i) - 0.5) * 180 + phase * 22 + Math.sin(phase * 9 + i) * 5, -130 + phase * 126, 1.8, 0.8, phase * 7, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();
}

function drawTreeArtwork(ctx: CanvasRenderingContext2D, seed: number, style: CherryStyle, distant: boolean) {
    const branchPhase = 6;
    const r = (n: number) => sceneRandom(seed, n + 7000);
    const colors = distant ? ['#8c7f91', '#a18b9e', '#b299aa', '#c0a8b3'] : ['#896779', '#af8097', '#d09bb0', '#efc3cc'];
    ctx.save();
    ctx.lineCap = 'round';
    const mirror = r(1) > 0.5 ? 1 : -1;
    ctx.scale(mirror, 1);
    const bend = (r(2) - 0.5) * 14;
    const stroke = (points: number[], width: number, color = '#514047') => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
        ctx.moveTo(points[0], points[1]); ctx.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]); ctx.stroke();
    };
    const pointOnCurve = (points: number[], t: number) => {
        const u = 1 - t;
        return [0, 1].map(axis => u ** 3 * points[axis] + 3 * u * u * t * points[axis + 2]
            + 3 * u * t * t * points[axis + 4] + t ** 3 * points[axis + 6]);
    };
    const spray = (cx: number, cy: number, radius: number, id: number, density: number) => {
        for (let i = 0; i < density; i++) {
            const a = r(id + i * 6) * Math.PI * 2;
            const d = Math.sqrt(r(id + i * 6 + 1));
            const px = cx + Math.cos(a) * radius * d;
            const py = cy + Math.sin(a) * radius * d * 0.58;
            const size = (1.1 + r(id + i * 6 + 2) * 2.3) * (style === 'layered' ? 1.25 : 1);
            const light = r(id + i * 6 + 3) + (cy - py) / radius * 0.6;
            ctx.fillStyle = colors[light > 0.7 ? 3 : light > 0.3 ? 2 : 1];
            ctx.beginPath();
            for (let petal = 0; petal < 3; petal++) {
                const angle = petal * Math.PI * 2 / 3 + a;
                const fx = px + Math.cos(angle) * size * 0.52;
                const fy = py + Math.sin(angle) * size * 0.42;
                ctx.moveTo(fx + size * 0.65, fy); ctx.ellipse(fx, fy, size * 0.65, size * 0.48, angle, 0, Math.PI * 2);
            }
            ctx.fill();
        }
    };

    ctx.fillStyle = '#4b3c42'; ctx.beginPath(); ctx.moveTo(-13, 0);
    ctx.bezierCurveTo(-3, -15, -8, -36, 0, -65);
    ctx.bezierCurveTo(9, -95, -8 + bend, -115, -6 + bend, -146);
    ctx.lineTo(bend, -146); ctx.bezierCurveTo(-1 + bend, -114, 21, -94, 10, -62);
    ctx.bezierCurveTo(1, -28, 8, -9, 17, 1); ctx.quadraticCurveTo(3, -3, -13, 0); ctx.fill();
    stroke([0, -4, -3, -34, 10, -63, 7, -82], 1.5, '#997a796e');

    // Midpoints of the trunk's two upper edges keep every fork inside the bark.
    const trunkCenter = [5, -63.5, 15, -94.5, bend - 4.5, -114.5, bend - 3, -146];
    const limbs = [
        [0.2, -31, -108, -64, -120, -91, -138],
        [0.39, 30, -109, 65, -120, 88, -152],
        [0.63, -26, -136, -43, -145, -53, -179],
        [0.8, 19, -144, 14, -171, 31, -190],
        [0.87, -12, -152, -15, -180, -9, -197],
        [0.47, 23, -116, 46, -130, 58, -168],
    ];
    const tips: {x: number; y: number; radius: number; id: number}[] = [];
    limbs.forEach((original, k) => {
        const [attachment, ...curve] = original;
        const p = [...pointOnCurve(trunkCenter, attachment), ...curve];
        const sway = Math.sin(branchPhase + k * 0.7) * 1.2;
        p[6] += bend + (r(k + 10) - 0.5) * 12 + sway;
        p[7] += (r(k + 20) - 0.5) * 10;
        stroke(p, 4.8 - k * 0.45);
        const [forkX, forkY] = pointOnCurve(p, 0.78);
        stroke([forkX, forkY, forkX + 4, forkY - 11, p[6] - 3, p[7] - 8, p[6] + 5, p[7] - 10], 1.2);
        for (let j = 0; j < 7; j++) {
            const t = 0.32 + j * 0.095;
            const [bx, by] = pointOnCurve(p, t);
            const direction = j % 2 ? 1 : -1;
            const tx = bx + direction * (10 + r(100 + k * 20 + j) * 20);
            const ty = by - 12 - r(250 + k * 20 + j) * 19;
            const id = 1000 + k * 1500 + j * 170;
            if (style === 'weeping') {
                const drop = 28 + r(id) * 46;
                const endX = tx + direction * 7 + Math.sin(branchPhase + j) * 2;
                stroke([bx, by, tx, ty - 15, endX, ty + drop * 0.35, endX, ty + drop], 1, '#70515c');
                for (let b = 0; b < 9; b++) {
                    const v = b / 8;
                    tips.push({x: tx + (endX - tx) * v, y: ty + drop * v, radius: 4.5 + (1 - v) * 4, id: id + b * 12000});
                }
            } else {
                stroke([bx, by, bx + direction * 9, by - 6, tx - direction * 5, ty + 8, tx, ty], 1.4, '#664954');
                tips.push({x: tx, y: ty, radius: style === 'layered' ? 19 + r(id) * 9 : 10 + r(id) * 8, id});
            }
        }
    });
    tips.sort((a, b) => a.y - b.y);
    for (const tip of tips) {
        if (style === 'layered') {
            ctx.fillStyle = colors[0]; ctx.beginPath();
            for (let i = 0; i < 11; i++) {
                const a = i / 11 * Math.PI * 2;
                const px = tip.x + Math.cos(a) * tip.radius * 0.7;
                const py = tip.y + Math.sin(a) * tip.radius * 0.32;
                ctx.moveTo(px + tip.radius * 0.36, py);
                ctx.ellipse(px, py, tip.radius * 0.36, tip.radius * 0.26, 0, 0, Math.PI * 2);
            }
            ctx.fill();
        }
        spray(tip.x, tip.y - (style === 'layered' ? 3 : 0), tip.radius, tip.id, style === 'layered' ? 80 : style === 'weeping' ? 7 : 29);
    }
    ctx.restore();
}
