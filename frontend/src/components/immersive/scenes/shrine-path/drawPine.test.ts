/** @vitest-environment jsdom */
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cacheColor, drawPine} from './drawGarden';

function recordingContext(calls: string[], fills: string[]) {
    return new Proxy({globalAlpha: 1}, {
        get: (target, name) => {
            const key = String(name);
            if (key in target) return target[key as keyof typeof target];
            if (key === 'getTransform') return () => ({a: 1, b: 0});
            if (key.startsWith('create')) return () => ({addColorStop() {}});
            return () => { calls.push(key); };
        },
        set: (target, name, value) => {
            if (String(name) === 'fillStyle' || String(name) === 'strokeStyle') fills.push(String(value));
            (target as Record<string, unknown>)[String(name)] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

let artworkCalls: string[];
let artworkFills: string[];
beforeEach(() => {
    artworkCalls = [];
    artworkFills = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recordingContext(artworkCalls, artworkFills) as never);
});
afterEach(() => vi.restoreAllMocks());

it.each([[true], [false]])('caches the detailed pine artwork and caps it with snow: %s', snow => {
    const calls: string[] = [];
    drawPine(recordingContext(calls, []), 0, 0, 200, 11 + Number(snow), '#203c35', 4, snow ? 'snow' : 'blossom');
    expect(calls.filter(name => name === 'drawImage')).toHaveLength(1);
    expect(artworkCalls.filter(name => name === 'clip').length).toBeGreaterThan(5);
    expect(artworkCalls.filter(name => name === 'stroke').length).toBeGreaterThan(100);
    expect(artworkFills.some(fill => fill.startsWith('rgba(96, 122, 142'))).toBe(snow);
});

it('reuses cached artwork while a palette transition blends colors', () => {
    const calls: string[] = [];
    drawPine(recordingContext(calls, []), 0, 0, 200, 5, 'rgb(32, 60, 53)', 4);
    const drawn = artworkCalls.length;
    drawPine(recordingContext(calls, []), 0, 0, 200, 5, 'rgb(30, 62, 55)', 4);
    expect(artworkCalls.length).toBe(drawn);
    expect(cacheColor('rgb(32, 60, 53)')).toBe(cacheColor('rgb(30, 62, 55)'));
});

it('keys hex and blended rgb forms of the same color identically without losing its hue', () => {
    expect(cacheColor('#253b37')).toBe(cacheColor('rgb(37, 59, 55)'));
    expect(cacheColor('#253b37')).toBe('rgb(40, 56, 56)');
    expect(cacheColor('#fff')).toBe('rgb(255, 255, 255)');
    const calls: string[] = [];
    drawPine(recordingContext(calls, []), 0, 0, 200, 9, '#253b37', 4);
    const drawn = artworkCalls.length;
    drawPine(recordingContext(calls, []), 0, 0, 200, 9, 'rgb(37, 59, 55)', 4);
    expect(artworkCalls.length).toBe(drawn);
});

it('keeps every pine from a wide frame cached for the next frame', () => {
    const calls: string[] = [];
    for (let frame = 0; frame < 2; frame++) {
        const before = artworkCalls.length;
        for (let tree = 0; tree < 40; tree++) drawPine(recordingContext(calls, []), tree * 30, 0, 120, 1000 + tree, '#203c35', 4);
        if (frame === 1) expect(artworkCalls.length).toBe(before);
    }
});
