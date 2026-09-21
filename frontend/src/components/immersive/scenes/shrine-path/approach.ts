export const TORII_FOOT = {offset: 57, halfWidth: 12, back: 3, front: 1};

// Ease toward a modest angle at the edges; look straight down the approach at screen center.
const MAX_APPROACH_LEAN = 0.9;

export function approachSection(gateX: number, shrineY: number, gateY: number, scale: number, depth: number, viewportWidth: number) {
    const gateScale = scale * (0.2 + depth * 0.8);
    const y = shrineY + (gateY - shrineY) * depth;
    const lean = Math.tanh((viewportWidth * 0.5 - gateX) / (viewportWidth * 0.5)) * MAX_APPROACH_LEAN;
    const x = gateX + (gateY - shrineY) * lean * (1 - depth);
    const halfWidth = (TORII_FOOT.offset - TORII_FOOT.halfWidth - 6) * gateScale;
    return {
        x, y,
        left: {x: x - halfWidth, y},
        right: {x: x + halfWidth, y},
        scale: gateScale,
        halfWidth,
    };
}
