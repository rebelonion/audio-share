/** @vitest-environment jsdom */

import {act, cleanup, fireEvent, render} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import SceneCanvas from './SceneCanvas';
import {trainSeek, trainSpan} from '../night-train/nightTrain';

const disconnect = vi.fn();
const renderFrame = vi.fn();
const onPreview = vi.fn();
const onSeek = vi.fn();
const data = {};
const props = {
    trackKey: 'track', currentTime: 10, duration: 120, seekVersion: 0, isPlaying: true, isLoading: false,
    motion: true, canSeek: true, previewTime: null, onPreview, onSeek,
    data, renderFrame, travelSpan: trainSpan, seekFromDrag: trainSeek, className: 'test-scene',
};

function advanceFrame(now: number) {
    vi.mocked(performance.now).mockReturnValue(now);
    const callback = vi.mocked(requestAnimationFrame).mock.lastCall![0];
    act(() => callback(now));
}

beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({setTransform: vi.fn()} as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1440, 800));
    vi.stubGlobal('ResizeObserver', class {observe = vi.fn(); disconnect = disconnect;});
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
        pointerId: number;
        isPrimary: boolean;
        pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
            this.isPrimary = init.isPrimary ?? true;
            this.pointerType = init.pointerType ?? 'mouse';
        }
    });
});

it('preserves animation and parallax when artwork or waveform data arrives', () => {
    const view = render(<SceneCanvas {...props} isPlaying={false} />);
    fireEvent.pointerMove(view.container.querySelector('canvas')!, {clientX: 1000, clientY: 800});
    advanceFrame(40);
    advanceFrame(80);
    const previous = renderFrame.mock.lastCall![2];
    const loadedData = {loaded: true};
    view.rerender(<SceneCanvas {...props} isPlaying={false} data={loadedData} />);
    advanceFrame(120);
    const frame = renderFrame.mock.lastCall![2];
    expect(renderFrame.mock.lastCall![1]).toBe(loadedData);
    expect(frame.ambientTime).toBeCloseTo(previous.ambientTime + 0.04);
    expect(frame.pointerX).toBeGreaterThan(previous.pointerX);
    expect(frame.pointerY).toBeGreaterThan(previous.pointerY);
    expect(frame.time).toBe(10);
    expect(disconnect).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledOnce();
});

it('starts playback from the current position without counting loading time', () => {
    const view = render(<SceneCanvas {...props} isPlaying={false} />);
    advanceFrame(5000);
    expect(renderFrame.mock.lastCall![2].time).toBe(10);
    view.rerender(<SceneCanvas {...props} />);
    advanceFrame(5040);
    expect(renderFrame.mock.lastCall![2]).toMatchObject({time: 10, moving: true});
    advanceFrame(5080);
    expect(renderFrame.mock.lastCall![2].time).toBeCloseTo(10.04);
    view.rerender(<SceneCanvas {...props} currentTime={10.08} />);
    advanceFrame(5120);
    expect(renderFrame.mock.lastCall![2].time).toBeCloseTo(10.08);
});

it('keeps traveling through a slow track change without restarting the canvas or ambient clock', () => {
    const view = render(<SceneCanvas {...props} currentTime={119} />);
    advanceFrame(40);
    const before = renderFrame.mock.lastCall![2];
    const flat = {flat: true};
    view.rerender(<SceneCanvas {...props} trackKey="next" currentTime={0} duration={0} isPlaying={false} isLoading data={flat} />);
    advanceFrame(80);
    const changed = renderFrame.mock.lastCall![2];
    expect(changed.time).toBe(0);
    expect(changed.moving).toBe(true);
    expect(changed.travel).toBeGreaterThan(before.travel);
    expect(changed.travel - before.travel).toBeLessThan(0.01);
    expect(changed.ambientTime).toBeCloseTo(before.ambientTime + 0.04);
    expect(changed.layers[0].data).toBe(data);
    for (let now = 120; now <= 3000; now += 40) advanceFrame(now);
    expect(renderFrame.mock.lastCall![2].layers).toEqual([{data: flat, time: 0, duration: 0, weight: 1}]);
    const waiting = renderFrame.mock.lastCall![2];
    const loaded = {waveform: true};
    view.rerender(<SceneCanvas {...props} trackKey="next" currentTime={0} duration={600} data={loaded} />);
    advanceFrame(3040);
    const ready = renderFrame.mock.lastCall![2];
    expect(ready.travel).toBeCloseTo(waiting.travel);
    expect(ready.layers[0].data).toBe(flat);
    expect(disconnect).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledOnce();
});

it('returns the journey to its original position when a seek preview is cancelled', () => {
    const view = render(<SceneCanvas {...props} />);
    const original = renderFrame.mock.lastCall![2].travel;
    view.rerender(<SceneCanvas {...props} previewTime={50} />);
    advanceFrame(40);
    expect(renderFrame.mock.lastCall![2].travel).toBeCloseTo(original + 1);
    view.rerender(<SceneCanvas {...props} />);
    advanceFrame(80);
    expect(renderFrame.mock.lastCall![2].travel).toBeCloseTo(original);
});

it('discards an active drag when the current track changes', () => {
    const view = render(<SceneCanvas {...props} />);
    const canvas = view.container.querySelector('canvas')!;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = () => true;
    canvas.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(canvas, {clientX: 720, pointerId: 1});
    fireEvent.pointerMove(canvas, {clientX: 0, pointerId: 1});
    view.rerender(<SceneCanvas {...props} trackKey="next" currentTime={0} />);
    fireEvent.pointerUp(canvas, {pointerId: 1});
    expect(onSeek).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
});

it('redraws loaded artwork in still mode and resumes ambient motion without resetting it', () => {
    const view = render(<SceneCanvas {...props} />);
    advanceFrame(40);
    advanceFrame(80);
    view.rerender(<SceneCanvas {...props} motion={false} />);
    const frozenAmbientTime = renderFrame.mock.lastCall![2].ambientTime;
    const loadedData = {loaded: true};
    vi.mocked(performance.now).mockReturnValue(5000);
    view.rerender(<SceneCanvas {...props} motion={false} data={loadedData} />);
    expect(renderFrame.mock.lastCall![1]).toBe(loadedData);
    expect(renderFrame.mock.lastCall![2].ambientTime).toBe(frozenAmbientTime);
    view.rerender(<SceneCanvas {...props} data={loadedData} />);
    advanceFrame(5040);
    expect(renderFrame.mock.lastCall![2].ambientTime).toBeCloseTo(frozenAmbientTime + 0.04);
    expect(disconnect).not.toHaveBeenCalled();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

it('freezes the scenery in still mode while allowing seek previews', () => {
    const view = render(<SceneCanvas {...props} motion={false} />);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(renderFrame.mock.lastCall?.[2]).toMatchObject({time: 10, moving: false, pointerX: 0, pointerY: 0});
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={15} />);
    expect(renderFrame.mock.lastCall?.[2].time).toBe(10);
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={15} previewTime={50} />);
    expect(renderFrame.mock.lastCall?.[2].time).toBe(50);
    expect(renderFrame.mock.lastCall?.[2].travel).toBeCloseTo(50 / trainSpan(120));
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={15} />);
    expect(renderFrame.mock.lastCall?.[2].time).toBe(10);
    expect(renderFrame.mock.lastCall?.[2].travel).toBeCloseTo(10 / trainSpan(120));
});

it.each([true, false])('applies external seeks in still mode with playing=%s', isPlaying => {
    const view = render(<SceneCanvas {...props} motion={false} isPlaying={isPlaying} />);
    view.rerender(<SceneCanvas {...props} motion={false} isPlaying={isPlaying} currentTime={90} seekVersion={1} />);
    expect(renderFrame.mock.lastCall![2]).toMatchObject({time: 90, ambientTime: 0, moving: false});
    expect(renderFrame.mock.lastCall![2].travel).toBeCloseTo(90 / trainSpan(120));
    expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it('keeps a still scene frozen across playback progress, pause, and resume', () => {
    const view = render(<SceneCanvas {...props} motion={false} />);
    const frozen = renderFrame.mock.lastCall![2];
    for (const playback of [
        {currentTime: 30, isPlaying: true},
        {currentTime: 30, isPlaying: false},
        {currentTime: 30, isPlaying: true},
        {currentTime: 40, isPlaying: true},
        {currentTime: 40, isPlaying: false},
    ]) {
        view.rerender(<SceneCanvas {...props} {...playback} motion={false} />);
        expect(renderFrame.mock.lastCall![2]).toMatchObject({
            time: frozen.time, travel: frozen.travel, ambientTime: frozen.ambientTime, moving: false,
        });
    }
    expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it('keeps playback frozen after an external seek and handles seeking to the current audio time', () => {
    const view = render(<SceneCanvas {...props} motion={false} />);
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={90} seekVersion={1} />);
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={95} seekVersion={1} />);
    expect(renderFrame.mock.lastCall![2].time).toBe(90);
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={95} seekVersion={2} />);
    expect(renderFrame.mock.lastCall![2].time).toBe(95);
    expect(renderFrame.mock.lastCall![2].travel).toBeCloseTo(95 / trainSpan(120));
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={20} seekVersion={3} />);
    expect(renderFrame.mock.lastCall![2].time).toBe(20);
    expect(renderFrame.mock.lastCall![2].travel).toBeCloseTo(20 / trainSpan(120));
});

it.each(['pointerCancel', 'lostPointerCapture', 'pointerUp'] as const)('handles %s without retaining a canceled still-scene preview', event => {
    const view = render(<SceneCanvas {...props} motion={false} />);
    const canvas = view.container.querySelector('canvas')!;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = () => true;
    canvas.releasePointerCapture = vi.fn();
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={15} />);
    fireEvent.pointerDown(canvas, {clientX: 720, pointerId: 1});
    fireEvent.pointerMove(canvas, {clientX: 0, pointerId: 1});
    expect(onPreview).toHaveBeenLastCalledWith(35);
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={16} previewTime={35} />);
    expect(renderFrame.mock.lastCall![2].time).toBe(35);
    fireEvent[event](canvas, {pointerId: 1});
    expect(onPreview).toHaveBeenLastCalledWith(null);
    const committed = event === 'pointerUp';
    if (committed) expect(onSeek).toHaveBeenCalledExactlyOnceWith(35);
    else expect(onSeek).not.toHaveBeenCalled();
    view.rerender(<SceneCanvas {...props} motion={false} currentTime={committed ? 35 : 16} seekVersion={committed ? 1 : 0} />);
    expect(renderFrame.mock.lastCall![2].time).toBe(committed ? 35 : 10);
    expect(renderFrame.mock.lastCall![2].travel).toBeCloseTo((committed ? 35 : 10) / trainSpan(120));
});

it('stops work in a hidden tab and releases the canvas on unmount', () => {
    const view = render(<SceneCanvas {...props} />);
    expect(requestAnimationFrame).toHaveBeenCalled();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    vi.mocked(requestAnimationFrame).mockClear();
    fireEvent(document, new Event('visibilitychange'));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.mocked(requestAnimationFrame).mockClear();
    fireEvent(document, new Event('visibilitychange'));
    expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it('only commits a drag on release, ignores other pointers, and cancels cleanly', () => {
    const {container} = render(<SceneCanvas {...props} motion={false} />);
    const canvas = container.querySelector('canvas')!;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = () => true;
    canvas.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(canvas, {clientX: 720, pointerId: 1});
    fireEvent.pointerMove(canvas, {clientX: 0, pointerId: 2});
    expect(onPreview).not.toHaveBeenCalled();
    fireEvent.pointerMove(canvas, {clientX: 0, pointerId: 1});
    expect(onPreview).toHaveBeenLastCalledWith(30);
    expect(onSeek).not.toHaveBeenCalled();
    fireEvent.pointerCancel(canvas, {pointerId: 1});
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(onSeek).not.toHaveBeenCalled();

    fireEvent.pointerDown(canvas, {clientX: 720, pointerId: 3});
    fireEvent.pointerMove(canvas, {clientX: 0, pointerId: 3});
    fireEvent.pointerUp(canvas, {pointerId: 3});
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(30);
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(canvas.releasePointerCapture).toHaveBeenLastCalledWith(3);
});


it.each([390, 844, 1440])('maps the same pixel drag to the same seek at width %s', width => {
    vi.mocked(HTMLCanvasElement.prototype.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, width, 800));
    const view = render(<SceneCanvas {...props} motion={false} />);
    const canvas = view.container.querySelector('canvas')!;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = () => true;
    canvas.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(canvas, {clientX: 200, pointerId: 1});
    fireEvent.pointerMove(canvas, {clientX: 56, pointerId: 1});
    expect(onPreview).toHaveBeenLastCalledWith(14);
    fireEvent.pointerUp(canvas, {pointerId: 1});
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(14);
});

it('smooths live levels, releases during buffering, and freezes lighting in still mode', () => {
    const readAudioLevel = vi.fn(() => 1);
    const view = render(<SceneCanvas {...props} readAudioLevel={readAudioLevel} />);
    advanceFrame(40);
    const active = renderFrame.mock.lastCall![2].audioLevel;
    expect(active).toBeGreaterThan(0);
    expect(active).toBeLessThan(1);
    view.rerender(<SceneCanvas {...props} readAudioLevel={readAudioLevel} isLoading />);
    readAudioLevel.mockClear();
    advanceFrame(80);
    const released = renderFrame.mock.lastCall![2].audioLevel;
    expect(released).toBeLessThan(active);
    expect(readAudioLevel).not.toHaveBeenCalled();
    view.rerender(<SceneCanvas {...props} readAudioLevel={readAudioLevel} motion={false} />);
    view.rerender(<SceneCanvas {...props} readAudioLevel={readAudioLevel} motion={false} currentTime={20} />);
    expect(renderFrame.mock.lastCall![2].audioLevel).toBe(released);
    expect(readAudioLevel).not.toHaveBeenCalled();
});

it('does not sample live audio while the document is hidden', () => {
    const readAudioLevel = vi.fn(() => 1);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    render(<SceneCanvas {...props} readAudioLevel={readAudioLevel} />);
    expect(readAudioLevel).not.toHaveBeenCalled();
    hidden.mockRestore();
});
