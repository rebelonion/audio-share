/** @vitest-environment jsdom */

import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createPondSceneRenderer} from './pondRenderer';
import {createPond} from './pond';
import type {SceneFrame} from '../types';
import type {PondRenderRequest, PondRenderResult} from './pondCanvas';

const fallback = vi.hoisted(() => ({draw: vi.fn(), dispose: vi.fn()}));
vi.mock('./drawPond', () => ({createPondRenderer: () => fallback}));

class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((event: MessageEvent<PondRenderResult>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage = vi.fn<(request: PondRenderRequest) => void>();
    terminate = vi.fn();
    constructor() { FakeWorker.instances.push(this); }
    finish(bitmap = {close: vi.fn()} as unknown as ImageBitmap) {
        this.onmessage?.({data: {bitmap}} as MessageEvent<PondRenderResult>);
        return bitmap;
    }
}

const data = createPond('test', null);
const frame: SceneFrame<typeof data> = {
    width: 390, height: 844, ambientTime: 1, time: 1, duration: 120, moving: true,
    pointerX: 0, pointerY: 0, travel: 0, travelSpan: 1, layers: [{data, time: 1, duration: 120, weight: 1}],
};
let ctx: CanvasRenderingContext2D;

beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    ctx = {canvas: {width: 780, height: 1688}, setTransform: vi.fn(), drawImage: vi.fn()} as unknown as CanvasRenderingContext2D;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); document.body.replaceChildren(); });

it('paints the pond immediately and bounds worker work to one active and one latest frame', () => {
    const renderer = createPondSceneRenderer();
    renderer.draw(ctx, data, frame);
    expect(fallback.draw).toHaveBeenCalledWith(ctx, data, frame);
    const worker = FakeWorker.instances[0];
    for (let ambientTime = 2; ambientTime <= 20; ambientTime++) renderer.draw(ctx, data, {...frame, ambientTime});
    expect(worker.postMessage).toHaveBeenCalledOnce();
    const first = worker.finish();
    expect(ctx.drawImage).toHaveBeenLastCalledWith(first, 0, 0, 390, 844);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage.mock.lastCall![0].frame.ambientTime).toBe(20);
    const second = worker.finish();
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).not.toHaveBeenCalled();
    renderer.dispose();
    expect(second.close).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
});

it('discards an old orientation and renders the newest dimensions', () => {
    const renderer = createPondSceneRenderer();
    renderer.draw(ctx, data, frame);
    const worker = FakeWorker.instances[0];
    ctx.canvas.width = 1688;
    ctx.canvas.height = 780;
    renderer.draw(ctx, data, {...frame, width: 844, height: 390});
    const stale = worker.finish();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    const current = worker.finish();
    expect(ctx.drawImage).toHaveBeenLastCalledWith(current, 0, 0, 844, 390);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    renderer.dispose();
});

it('finishes a still frame without restarting motion or accepting an older moving frame', () => {
    const renderer = createPondSceneRenderer();
    renderer.draw(ctx, data, frame);
    const worker = FakeWorker.instances[0];
    renderer.draw(ctx, data, {...frame, ambientTime: 2, moving: false});
    expect(worker.finish().close).toHaveBeenCalledOnce();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    worker.finish();
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    renderer.dispose();
});

it('continues presenting slow worker frames when audio is paused but scenery motion is enabled', () => {
    const renderer = createPondSceneRenderer();
    const paused = {...frame, moving: false, motionEnabled: true};
    renderer.draw(ctx, data, paused);
    renderer.draw(ctx, data, {...paused, ambientTime: 2});
    const bitmap = FakeWorker.instances[0].finish();
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 390, 844);
    renderer.dispose();
});

it('keeps rendering with the canvas fallback after a worker failure', () => {
    const renderer = createPondSceneRenderer();
    renderer.draw(ctx, data, frame);
    const worker = FakeWorker.instances[0];
    const bitmap = worker.finish();
    fallback.draw.mockClear();
    worker.onerror!(new ErrorEvent('error'));
    expect(fallback.draw).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
    renderer.draw(ctx, data, {...frame, ambientTime: 2});
    expect(fallback.draw).toHaveBeenCalledTimes(2);
    expect(FakeWorker.instances).toHaveLength(1);
    renderer.dispose();
});

it('cancels pending rendering on disposal and supports a fresh Strict Mode mount', () => {
    const renderer = createPondSceneRenderer();
    renderer.draw(ctx, data, frame);
    const worker = FakeWorker.instances[0];
    renderer.draw(ctx, data, {...frame, ambientTime: 2});
    renderer.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    renderer.draw(ctx, data, {...frame, ambientTime: 3});
    const nextWorker = FakeWorker.instances[1];
    expect(nextWorker.postMessage.mock.lastCall![0].frame.ambientTime).toBe(3);
    renderer.dispose();
});

it.each(['Worker', 'OffscreenCanvas'])('uses the pond fallback when %s is unavailable', api => {
    vi.stubGlobal(api, undefined);
    const renderer = createPondSceneRenderer();
    renderer.draw(ctx, data, frame);
    expect(fallback.draw).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(0);
    renderer.dispose();
});

it('presents worker bitmaps directly without copying or repainting an already displayed frame', () => {
    const fallbackBitmap = {close: vi.fn()};
    vi.stubGlobal('OffscreenCanvas', class {
        constructor(public width: number, public height: number) {}
        getContext() { return {setTransform: vi.fn()}; }
        transferToImageBitmap() { return fallbackBitmap; }
    });
    const transfer = vi.fn();
    const target = {canvas: ctx.canvas, transferFromImageBitmap: transfer} as unknown as ImageBitmapRenderingContext;
    const renderer = createPondSceneRenderer();
    renderer.drawBitmap(target, data, frame);
    expect(transfer).toHaveBeenCalledWith(fallbackBitmap);
    const worker = FakeWorker.instances[0];
    const next = worker.finish();
    expect(transfer).toHaveBeenLastCalledWith(next);
    renderer.drawBitmap(target, data, {...frame, ambientTime: 2});
    expect(transfer).toHaveBeenCalledTimes(2);
    renderer.dispose();
    expect(next.close).not.toHaveBeenCalled(); // transferFromImageBitmap consumes the image.
});

it('hands a fresh display canvas to the worker and removes it on disposal', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 780;
    canvas.height = 1688;
    canvas.className = 'immersive-canvas';
    document.body.append(canvas);
    Object.assign(ctx, {canvas});
    const target = {} as OffscreenCanvas;
    const transfer = vi.fn(() => target);
    vi.stubGlobal('HTMLCanvasElement', HTMLCanvasElement);
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {configurable: true, value: transfer});
    try {
        const renderer = createPondSceneRenderer();
        renderer.draw(ctx, data, frame);
        const worker = FakeWorker.instances[0];
        const output = document.querySelector<HTMLCanvasElement>('[data-pond-direct]')!;
        expect(output).not.toBe(canvas);
        expect(output.className).toBe(canvas.className);
        expect(output.style.opacity).toBe('0');
        expect(worker.postMessage.mock.calls[0]).toEqual([{target}, [target]]);
        worker.onmessage!({data: {}} as MessageEvent<PondRenderResult>);
        expect(output.style.opacity).toBe('1');
        fallback.draw.mockClear();
        renderer.draw(ctx, data, {...frame, ambientTime: 2});
        expect(fallback.draw).not.toHaveBeenCalled();
        renderer.dispose();
        expect(document.querySelector('[data-pond-direct]')).toBeNull();
        expect(canvas.isConnected).toBe(true);
        expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
        delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen;
    }
});

it('keeps bitmap rendering available if transferring a display canvas is rejected', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 780;
    canvas.height = 1688;
    document.body.append(canvas);
    Object.assign(ctx, {canvas});
    Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
        configurable: true, value: () => { throw new Error('Unavailable'); },
    });
    try {
        const renderer = createPondSceneRenderer();
        renderer.draw(ctx, data, frame);
        expect(document.querySelector('[data-pond-direct]')).toBeNull();
        const worker = FakeWorker.instances[0];
        expect(worker.postMessage).toHaveBeenCalledOnce();
        const bitmap = worker.finish();
        expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 390, 844);
        renderer.dispose();
    } finally {
        delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen;
    }
});
