import {sceneRandom} from '../shared/scenery';

const FACADES = [
    ['#34434a', '#1d3039', '#142731'],
    ['#3a4246', '#26333b', '#182831'],
    ['#344652', '#22333f', '#172b36'],
    ['#3b4448', '#273940', '#192d36'],
];

export function drawBuilding(
    ctx: CanvasRenderingContext2D, seed: number, index: number,
    x: number, base: number, width: number, height: number, scale: number, lightColor: string,
) {
    const random = (n: number) => sceneRandom(seed, index * 1901 + n + 7000);
    const style = Math.floor(random(0) * 4);
    const top = base - height;
    const side = width * 0.17;
    const face = width - side;
    const roof = style === 0 ? Math.min(height * 0.25, 15 * scale) : 0;
    const wallTop = top + roof;
    const [lit, wall, shade] = FACADES[style];

    const facade = ctx.createLinearGradient(x, 0, x + face, 0);
    facade.addColorStop(0, lit);
    facade.addColorStop(0.18, wall);
    facade.addColorStop(1, wall);
    ctx.fillStyle = facade;
    ctx.fillRect(x, wallTop, face, base - wallTop);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(x + face, wallTop);
    ctx.lineTo(x + width, wallTop + 4 * scale);
    ctx.lineTo(x + width, base);
    ctx.lineTo(x + face, base);
    ctx.fill();

    if (style === 0) {
        // Gabled homes have a chimney, slate roof, and a small attic light.
        ctx.fillStyle = '#152630';
        ctx.beginPath();
        ctx.moveTo(x, wallTop);
        ctx.lineTo(x + face * 0.5, top);
        ctx.lineTo(x + face, wallTop);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#263841';
        ctx.beginPath();
        ctx.moveTo(x + face * 0.5, top);
        ctx.lineTo(x + face * 0.5 + side, top + 3 * scale);
        ctx.lineTo(x + width, wallTop + 4 * scale);
        ctx.lineTo(x + face, wallTop);
        ctx.fill();
        ctx.fillStyle = wall;
        ctx.fillRect(x + face * 0.72, top - 2 * scale, 4 * scale, roof * 0.7 + 3 * scale);
        ctx.fillStyle = '#a18e6e65';
        ctx.fillRect(x + face * 0.46, top + roof * 0.52, 2 * scale, 3 * scale);
    } else {
        ctx.fillStyle = '#52606a65';
        ctx.fillRect(x - scale, top, face + 2 * scale, 1.5 * scale);
        ctx.fillStyle = '#122630';
        ctx.fillRect(x - scale, top + 2 * scale, face + 2 * scale, 2 * scale);
        const penthouse = Math.min(height * 0.12, 9 * scale);
        ctx.fillStyle = shade;
        ctx.fillRect(x + face * 0.24, top - penthouse, face * 0.48, penthouse);
        ctx.fillStyle = '#48566080';
        ctx.fillRect(x + face * 0.24, top - penthouse, face * 0.48, scale);
        if (height > 50 * scale && random(1) > 0.5) {
            ctx.strokeStyle = '#233843';
            ctx.lineWidth = scale;
            ctx.beginPath();
            ctx.moveTo(x + face * 0.6, top - penthouse);
            ctx.lineTo(x + face * 0.6, top - penthouse - 13 * scale);
            ctx.moveTo(x + face * 0.6 - 4 * scale, top - penthouse - 9 * scale);
            ctx.lineTo(x + face * 0.6 + 5 * scale, top - penthouse - 9 * scale);
            ctx.stroke();
        }
    }

    const floor = (style === 2 ? 9 : 12) * scale;
    const rows = Math.max(1, Math.floor((base - wallTop - 9 * scale) / floor));
    const columns = Math.max(2, Math.floor(face / ((style === 2 ? 7 : 11) * scale)));
    const margin = 4 * scale;
    const spacing = (face - margin * 2) / columns;
    const windowWidth = Math.min(spacing * (style === 2 ? 0.72 : 0.58), 6 * scale);
    const windowHeight = Math.min(6 * scale, (base - wallTop - 7 * scale) / rows * 0.5);
    for (let row = 0; row < rows; row++) {
        const y = wallTop + 5 * scale + row * floor;
        if (y + windowHeight > base - 6 * scale) continue;
        if (style === 1 || style === 2) {
            ctx.fillStyle = '#72828a17';
            ctx.fillRect(x, y - 2 * scale, face, scale * 0.7);
        }
        for (let column = 0; column < columns; column++) {
            const wx = x + margin + column * spacing;
            const light = random(20 + row * 41 + column);
            ctx.fillStyle = '#0c202dcc';
            ctx.fillRect(wx - scale * 0.5, y - scale * 0.5, windowWidth + scale, windowHeight + scale);
            ctx.save();
            ctx.fillStyle = light < 0.4 ? '#536c7c40' : light > 0.91 ? '#a3bec7b0' : lightColor;
            if (light >= 0.4 && light <= 0.91) ctx.globalAlpha = 0.35 + light * 0.45;
            ctx.fillRect(wx, y, windowWidth, windowHeight);
            ctx.restore();
            if (light > 0.4 && light < 0.65) {
                ctx.fillStyle = '#24303990';
                ctx.fillRect(wx, y, windowWidth, windowHeight * 0.45);
            }
            if (style !== 2) {
                ctx.fillStyle = '#1a2c3380';
                ctx.fillRect(wx + windowWidth * 0.48, y, scale * 0.6, windowHeight);
                ctx.fillStyle = '#7e89813b';
                ctx.fillRect(wx - scale, y + windowHeight, windowWidth + 2 * scale, scale * 0.7);
            }
        }
        if (style === 3 && height > 38 * scale) {
            ctx.fillStyle = '#101f2aaa';
            ctx.fillRect(x + 2 * scale, y + windowHeight + scale, face - 3 * scale, 3 * scale);
            ctx.fillStyle = '#66798370';
            ctx.fillRect(x + 2 * scale, y + windowHeight + scale, face - 3 * scale, scale * 0.7);
            for (let rail = 0; rail < 4; rail++) {
                ctx.fillRect(x + (face - 4 * scale) * rail / 4 + 3 * scale, y + windowHeight + scale, scale * 0.5, 3 * scale);
            }
        }
    }

    // An entrance and a few lit shopfronts give the buildings a ground floor.
    const doorWidth = Math.min(face * 0.17, 6 * scale);
    ctx.fillStyle = '#0e202a';
    ctx.fillRect(x + face * 0.58, base - 8 * scale, doorWidth, 8 * scale);
    ctx.fillStyle = '#e9bb7d70';
    ctx.fillRect(x + face * 0.58 + scale, base - 7 * scale, Math.max(scale, doorWidth - 2 * scale), 2 * scale);
    if (style === 1 && height > 24 * scale) {
        ctx.save();
        ctx.fillStyle = lightColor;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x + 3 * scale, base - 7 * scale, face * 0.37, 5 * scale);
        ctx.restore();
        ctx.fillStyle = '#243c44';
        ctx.fillRect(x + 2 * scale, base - 9 * scale, face * 0.43, 2 * scale);
    }
    ctx.fillStyle = '#0e242e';
    ctx.fillRect(x - scale, base - scale, width + 2 * scale, 2 * scale);
}
