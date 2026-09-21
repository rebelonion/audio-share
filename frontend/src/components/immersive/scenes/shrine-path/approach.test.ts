import {expect, it} from 'vitest';
import {approachSection, TORII_FOOT} from './approach';

it.each([[1440, 900], [390, 844], [320, 568], [844, 390]])('keeps the changing perspective clear of the gate feet at %s × %s', (width, height) => {
    const s = Math.min(1.4, Math.max(0.55, height / 850));
    for (const position of [-0.15, 0.15, 0.5, 0.85, 1.15]) {
        for (const pointerY of [-1, 0, 1]) {
            const gate = {x: width * position, y: height * 0.79 + pointerY * 8};
            const shrine = {x: gate.x, y: height * 0.704 + pointerY * 5};
            const span = gate.y - shrine.y;
            const start = approachSection(gate.x, shrine.y, gate.y, s, 0, width);
            const end = approachSection(gate.x, shrine.y, gate.y, s, 1, width);
            expect(Math.abs(start.x - end.x)).toBeLessThan(span);
            const pathEdgeAtY = (side: 'left' | 'right', y: number) => {
                const from = start[side];
                const to = end[side];
                return from.x + (to.x - from.x) * (y - from.y) / (to.y - from.y);
            };
            for (const depth of [0.35, 0.52, 0.65, 1]) {
                const section = approachSection(gate.x, shrine.y, gate.y, s, depth, width);
                expect(section.halfWidth).toBeGreaterThan(0);
                expect(section.x).toBeGreaterThanOrEqual(Math.min(start.x, end.x));
                expect(section.x).toBeLessThanOrEqual(Math.max(start.x, end.x));
                expect(section.left.y).toBe(section.right.y);
                for (const side of [-1, 1]) {
                    for (const cornerX of [-TORII_FOOT.halfWidth, TORII_FOOT.halfWidth]) {
                        for (const cornerY of [-TORII_FOOT.back, TORII_FOOT.front]) {
                            const dx = (side * TORII_FOOT.offset + cornerX) * section.scale;
                            const x = section.x + dx;
                            const y = section.y + cornerY * section.scale;
                            if (side < 0) expect(x).toBeLessThan(pathEdgeAtY('left', y));
                            else expect(x).toBeGreaterThan(pathEdgeAtY('right', y));
                        }
                    }
                }
            }
            const lamps = approachSection(gate.x, shrine.y, gate.y, s, 1 - 12 * s / span, width);
            for (const side of [-1, 1]) {
                const offset = side * (lamps.halfWidth + 80 * s);
                expect(lamps.y).toBeLessThan(height * 0.81 + pointerY * 10);
                for (const edge of [-5, 0]) {
                    const y = lamps.y + edge * s * 0.9;
                    const innerX = lamps.x + offset - side * 14 * s * 0.9;
                    if (side < 0) expect(innerX).toBeLessThan(pathEdgeAtY('left', y));
                    else expect(innerX).toBeGreaterThan(pathEdgeAtY('right', y));
                }
            }
        }
    }
});

it('looks straight ahead at center, mirrors either side, and moves the shrine more slowly than the entrance', () => {
    const width = 1000;
    const section = (x: number, depth: number) => approachSection(x, 600, 680, 1, depth, width);
    expect(section(500, 0).x).toBe(section(500, 1).x);
    const left = section(150, 0).x - section(150, 1).x;
    const right = section(850, 0).x - section(850, 1).x;
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(0);
    expect(left).toBeCloseTo(-right);
    const shrineTravel = section(499, 0).x - section(501, 0).x;
    const entranceTravel = section(499, 1).x - section(501, 1).x;
    expect(shrineTravel).toBeLessThan(0);
    expect(Math.abs(shrineTravel)).toBeLessThan(Math.abs(entranceTravel));
    expect(section(499, 0).x).toBeCloseTo(1000 - section(501, 0).x);
});
