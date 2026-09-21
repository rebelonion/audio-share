/** @vitest-environment jsdom */
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createAudioLevelReader, smoothAudioLevel} from './audioLevel';

let amplitude = 0.03;
const analyser = {
    fftSize: 2048,
    connect: vi.fn(), disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.fill(amplitude)),
};
const source = {connect: vi.fn(), disconnect: vi.fn()};
let context: FakeContext;
class FakeContext {
    state = 'suspended';
    destination = {};
    resume = vi.fn(async () => { this.state = 'running'; });
    close = vi.fn(async () => {});
    createAnalyser = vi.fn(() => analyser);
    createMediaElementSource = vi.fn(() => source);
}
function audio() {
    return {
        src: '/stream', crossOrigin: 'use-credentials', paused: false,
        ended: false, muted: false, readyState: 4,
    } as HTMLAudioElement;
}
beforeEach(() => {
    vi.clearAllMocks();
    amplitude = 0.03;
    context = new FakeContext();
    vi.stubGlobal('AudioContext', vi.fn(function () { return context; }));
});
afterEach(() => vi.unstubAllGlobals());

it('attaches once and keeps the output connected across track source changes', async () => {
    const reader = createAudioLevelReader();
    const media = audio();
    await reader.enable(() => media);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(analyser.connect).toHaveBeenCalledWith(context.destination);
    const level = reader.read();
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan(1);
    media.src = '/next-track';
    await reader.enable(() => media);
    expect(context.createMediaElementSource).toHaveBeenCalledOnce();
    expect(reader.read()).toBe(level);
    reader.dispose();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
});

it('gates silence, mute, pause and buffering without sampling', async () => {
    const reader = createAudioLevelReader();
    const media = audio();
    await reader.enable(() => media);
    amplitude = 0;
    expect(reader.read()).toBe(0);
    amplitude = 0.0001;
    expect(reader.read()).toBe(0);
    amplitude = 1;
    expect(reader.read()).toBe(1);
    analyser.getFloatTimeDomainData.mockClear();
    media.muted = true;
    expect(reader.read()).toBe(0);
    media.muted = false;
    Object.assign(media, {paused: true});
    expect(reader.read()).toBe(0);
    Object.assign(media, {paused: false, readyState: 2});
    expect(reader.read()).toBe(0);
    expect(analyser.getFloatTimeDomainData).not.toHaveBeenCalled();
});

it('leaves unsupported and unconfigured cross-origin playback alone', async () => {
    const reader = createAudioLevelReader();
    const media = audio();
    media.src = 'https://other.example/stream';
    media.crossOrigin = '';
    await reader.enable(() => media);
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    expect(reader.read()).toBe(0);
    vi.stubGlobal('AudioContext', undefined);
    await createAudioLevelReader().enable(() => audio());
});

it('does not attach after disposal while resuming', async () => {
    const reader = createAudioLevelReader();
    const pending = reader.enable(() => audio());
    reader.dispose();
    await pending;
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
});

it('can enable before a track is loaded', async () => {
    const reader = createAudioLevelReader();
    await reader.enable(() => null);
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    await reader.enable(() => audio());
    expect(context.createMediaElementSource).toHaveBeenCalledOnce();
});

it('uses a faster attack, slower release and frame-rate independent smoothing', () => {
    const attack = smoothAudioLevel(0, 1, 0.15);
    const release = smoothAudioLevel(1, 0, 0.15);
    expect(attack).toBeGreaterThan(0.6);
    expect(release).toBeGreaterThan(0.8);
    let level = 0;
    for (let i = 0; i < 30; i++) level = smoothAudioLevel(level, 1, 1 / 30);
    expect(level).toBeCloseTo(smoothAudioLevel(0, 1, 1));
    expect(smoothAudioLevel(level, 0, 0)).toBe(level);
});
