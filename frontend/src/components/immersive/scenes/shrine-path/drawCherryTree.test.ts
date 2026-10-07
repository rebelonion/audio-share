/** @vitest-environment jsdom */
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {drawCherryTree} from './drawCherryTree';

function recordingContext(calls: string[]) {
    return new Proxy({globalAlpha: 1}, {
        get: (target, name) => {
            const key = String(name);
            if (key in target) return target[key as keyof typeof target];
            if (key === 'getTransform') return () => ({a: 1, b: 0});
            if (key.startsWith('create')) return () => ({addColorStop() {}});
            return () => { calls.push(key); };
        },
        set: (target, name, value) => { (target as Record<string, unknown>)[String(name)] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recordingContext([]) as never);
});
afterEach(() => vi.restoreAllMocks());

it.each([
    ['blossom', true], ['autumn', true], ['leaf', false], ['snow', false],
] as const)('%s trees shed something: %s', (foliage, sheds) => {
    const calls: string[] = [];
    drawCherryTree(recordingContext(calls), 0, 0, 200, 7, 10, false, foliage);
    expect(calls.filter(name => name === 'ellipse').length > 0).toBe(sheds);
    expect(calls.filter(name => name === 'drawImage')).toHaveLength(1);
});
