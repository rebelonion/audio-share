import {afterEach, expect, it, vi} from 'vitest';
import {drawShrinePath} from './drawShrinePath';
import {drawCherryTree} from './drawCherryTree';
import {drawSeasonalAir} from './drawSeasonalAir';
import {drawPine} from './drawGarden';
import {createShrinePath, shrineSpan} from './shrinePath';
import {SHRINE_SEASON_PALETTES} from './palette';

vi.mock('./drawCherryTree', async importOriginal => ({
    ...await importOriginal<typeof import('./drawCherryTree')>(),
    drawCherryTree: vi.fn(),
}));
vi.mock('./drawSeasonalAir', () => ({drawSeasonalAir: vi.fn()}));
vi.mock('./drawGarden', async importOriginal => ({
    ...await importOriginal<typeof import('./drawGarden')>(),
    drawPine: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const gradient = {addColorStop() {}};
const ctx = new Proxy({}, {
    get: (_, name) => String(name).startsWith('create') ? () => gradient : () => {},
}) as CanvasRenderingContext2D;

it.each([
    ['spring', 'blossom'], ['summer', 'leaf'], ['autumn', 'autumn'], ['winter', 'snow'],
] as const)('dresses the %s scene with %s foliage and the matching air', (season, foliage) => {
    const scene = createShrinePath('journey', Uint8Array.from({length: 256}, (_, i) => i), SHRINE_SEASON_PALETTES[season], season);
    const duration = 120;
    drawShrinePath(ctx, scene, {
        width: 1280, height: 800, time: 30, duration, travel: 30 / shrineSpan(duration), travelSpan: shrineSpan(duration),
        ambientTime: 30, pointerX: 0, pointerY: 0, moving: true, layers: [{data: scene, time: 30, duration, weight: 1}],
    });
    const air = vi.mocked(drawSeasonalAir).mock.calls;
    expect(air).toHaveLength(1);
    expect(air[0].slice(1, 6)).toEqual([season, scene.seed, 30, 1280, 800]);
    expect(air[0][6]).toBeGreaterThan(0);
    const trees = vi.mocked(drawCherryTree).mock.calls;
    expect(trees.length).toBeGreaterThan(0);
    expect(trees.every(call => call[7] === foliage)).toBe(true);
    const pines = vi.mocked(drawPine).mock.calls;
    expect(pines.length).toBeGreaterThan(0);
    expect(pines.every(call => call[7] === foliage)).toBe(true);
});
