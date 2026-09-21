/** @vitest-environment jsdom */

import {act, cleanup, renderHook, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useAudioEngine} from './useAudioEngine';

const mediaAccess = vi.hoisted(() => ({
    requestMediaAccess: vi.fn(),
}));

vi.mock('@/lib/mediaAccess', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/mediaAccess')>(),
    requestMediaAccess: mediaAccess.requestMediaAccess,
}));

vi.mock('@/hooks/useRybbit', () => ({
    useRybbit: () => ({track: vi.fn()}),
}));

vi.mock('@/lib/api', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/api')>(),
    recordPlayEvent: vi.fn(async () => {}),
}));

class FakeAudio {
    static instances: FakeAudio[] = [];
    static playFailures: DOMException[] = [];

    currentTime = 0;
    duration = 120;
    ended = false;
    error: {code: number} | null = null;
    muted = false;
    paused = true;
    preload = '';
    crossOrigin = '';
    readyState = 0;
    src = '';
    volume = 1;

    private listeners = new Map<string, Array<() => void>>();

    constructor() {
        FakeAudio.instances.push(this);
    }

    addEventListener(name: string, listener: () => void) {
        this.listeners.set(name, [...(this.listeners.get(name) || []), listener]);
    }

    removeEventListener(name: string, listener: () => void) {
        this.listeners.set(name, (this.listeners.get(name) || []).filter(candidate => candidate !== listener));
    }

    load() {}

    pause() {
        this.paused = true;
        this.emit('pause');
    }

    play() {
        const failure = FakeAudio.playFailures.shift();
        if (failure) {
            this.paused = true;
            return Promise.reject(failure);
        }
        this.paused = false;
        this.emit('play');
        return Promise.resolve();
    }

    removeAttribute(name: string) {
        if (name === 'src') this.src = '';
    }

    emit(name: string) {
        for (const listener of this.listeners.get(name) || []) listener();
    }
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(next => {
        resolve = next;
    });
    return {promise, resolve};
}

beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudio.playFailures = [];
    vi.stubGlobal('Audio', FakeAudio);
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('useAudioEngine', () => {
    it('signals explicit seeks without treating playback updates as seeks', async () => {
        mediaAccess.requestMediaAccess.mockResolvedValueOnce({
            accessKey: 'signed-key', expiresAt: Date.now() + 60_000,
        });
        const currentTrackRef = {current: {
            id: 'track-1', src: '/audio/key/track-key', shareKey: 'track-key',
            name: 'Track', source: 'share' as const,
        }};
        const {result} = renderHook(() => useAudioEngine({
            currentTrackRef, metadataRef: {current: null},
            onEndedRef: {current: vi.fn()}, waveformDuration: 0,
        }));
        act(() => result.current.seekTo(90));
        expect(result.current.seekVersion).toBe(0);
        act(() => result.current.play());
        await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
        const audio = FakeAudio.instances[0];
        expect(audio.crossOrigin).toBe('use-credentials');
        act(() => audio.emit('loadedmetadata'));
        act(() => result.current.seekTo(90));
        expect(result.current.currentTime).toBe(90);
        expect(result.current.seekVersion).toBe(1);
        act(() => { audio.currentTime = 95; audio.emit('timeupdate'); });
        expect(result.current.currentTime).toBe(95);
        expect(result.current.seekVersion).toBe(1);
        act(() => result.current.seekTo(95));
        expect(result.current.seekVersion).toBe(2);
        act(() => result.current.seekBy(30));
        expect(result.current.currentTime).toBe(120);
        expect(result.current.seekVersion).toBe(3);
    });

    it('starts newly loaded audio at an explicitly requested time', async () => {
        mediaAccess.requestMediaAccess.mockResolvedValueOnce({
            accessKey: 'signed-key',
            expiresAt: Date.now() + 60_000,
        });
        const currentTrackRef = {
            current: {
                id: 'track-1',
                src: '/audio/key/track-key',
                shareKey: 'track-key',
                name: 'Track',
                source: 'share' as const,
            },
        };
        const {result} = renderHook(() => useAudioEngine({
            currentTrackRef,
            metadataRef: {current: null},
            onEndedRef: {current: vi.fn()},
            waveformDuration: 0,
        }));

        act(() => result.current.play(75));
        await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
        act(() => FakeAudio.instances[0].emit('loadedmetadata'));

        expect(FakeAudio.instances[0].currentTime).toBe(75);
        expect(result.current.currentTime).toBe(75);
    });

    it('retries blocked playback with the existing grant and audio element', async () => {
        mediaAccess.requestMediaAccess.mockResolvedValueOnce({
            accessKey: 'signed-key',
            expiresAt: Date.now() + 60_000,
        });
        FakeAudio.playFailures.push(new DOMException('Playback blocked', 'NotAllowedError'));
        const currentTrackRef = {
            current: {
                id: 'track-1',
                src: '/audio/key/track-key',
                shareKey: 'track-key',
                name: 'Track',
                source: 'browse' as const,
            },
        };
        const {result} = renderHook(() => useAudioEngine({
            currentTrackRef,
            metadataRef: {current: null},
            onEndedRef: {current: vi.fn()},
            waveformDuration: 0,
        }));

        act(() => result.current.play());
        await waitFor(() => expect(result.current.notice).toBe(
            'Ready to play — press play to continue.',
        ));
        expect(result.current.error).toBeNull();

        const authorizedAudio = FakeAudio.instances[0];
        act(() => result.current.play());

        await waitFor(() => {
            expect(result.current.isPlaying).toBe(true);
            expect(result.current.notice).toBeNull();
        });
        expect(result.current.error).toBeNull();
        expect(mediaAccess.requestMediaAccess).toHaveBeenCalledOnce();
        expect(FakeAudio.instances).toEqual([authorizedAudio]);
    });

    it('applies volume and mute changes made while media authorization is pending', async () => {
        const access = deferred<{accessKey: string; expiresAt: number}>();
        mediaAccess.requestMediaAccess.mockReturnValueOnce(access.promise);
        const currentTrackRef = {
            current: {
                id: 'track-1',
                src: '/audio/key/track-key',
                shareKey: 'track-key',
                name: 'Track',
                source: 'browse' as const,
            },
        };
        const metadataRef = {current: null};
        const onEndedRef = {current: vi.fn()};
        const {result} = renderHook(() => useAudioEngine({
            currentTrackRef,
            metadataRef,
            onEndedRef,
            waveformDuration: 0,
        }));

        act(() => result.current.play());
        await waitFor(() => expect(mediaAccess.requestMediaAccess).toHaveBeenCalledOnce());
        act(() => {
            result.current.setPlayerVolume(0.2);
            result.current.toggleMute();
        });
        await act(async () => {
            access.resolve({
                accessKey: 'signed-key',
                expiresAt: Date.now() + 60_000,
            });
            await access.promise;
        });

        await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
        expect(FakeAudio.instances[0].volume).toBe(0.2);
        expect(FakeAudio.instances[0].muted).toBe(true);
    });
});


function renderRecoveryEngine() {
    const currentTrackRef = {current: {
        id: 'recovery-track', src: '/audio/key/recovery-track', shareKey: 'recovery-track',
        name: 'Recovery track', source: 'share' as const,
    }};
    return renderHook(() => useAudioEngine({
        currentTrackRef, metadataRef: {current: null}, onEndedRef: {current: vi.fn()}, waveformDuration: 0,
    }));
}

describe('network recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mediaAccess.requestMediaAccess.mockResolvedValue({accessKey: 'valid-key', expiresAt: Date.now() + 60_000});
    });

    it('reuses authorization, restores position, and stops after two retries', async () => {
        const {result} = renderRecoveryEngine();
        await act(async () => result.current.play());
        const audio = FakeAudio.instances[0];
        act(() => { audio.emit('loadedmetadata'); audio.currentTime = 45; });
        audio.error = {code: 2};
        for (const delay of [500, 1000]) {
            act(() => audio.emit('error'));
            expect(result.current.notice).toBe('Reconnecting…');
            await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
            act(() => audio.emit('loadedmetadata'));
            expect(audio.currentTime).toBe(45);
            expect(result.current.isPlaying).toBe(true);
        }
        act(() => audio.emit('error'));
        expect(result.current.error).toContain('could not be loaded');
        expect(result.current.isLoading).toBe(false);
        expect(mediaAccess.requestMediaAccess).toHaveBeenCalledTimes(1);
    });

    it('keeps the original position if the first reconnect fails before metadata', async () => {
        const {result} = renderRecoveryEngine();
        await act(async () => result.current.play());
        const audio = FakeAudio.instances[0];
        act(() => { audio.emit('loadedmetadata'); audio.currentTime = 45; });
        audio.error = {code: 2};
        act(() => audio.emit('error'));
        await act(async () => { await vi.advanceTimersByTimeAsync(500); });
        // Loading a new media source resets the element before metadata arrives.
        audio.currentTime = 0;
        act(() => audio.emit('error'));
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        act(() => audio.emit('loadedmetadata'));
        expect(audio.currentTime).toBe(45);
        expect(result.current.currentTime).toBe(45);
        expect(mediaAccess.requestMediaAccess).toHaveBeenCalledTimes(1);
    });

    it('cancels a scheduled reconnect when paused', async () => {
        const {result} = renderRecoveryEngine();
        await act(async () => result.current.play());
        const audio = FakeAudio.instances[0];
        audio.error = {code: 2};
        act(() => audio.emit('error'));
        act(() => result.current.pause());
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
        expect(audio.paused).toBe(true);
        expect(result.current.isPlaying).toBe(false);
        expect(result.current.notice).toBeNull();
    });

    it('reloads a failed source when resuming after pausing a reconnect', async () => {
        const {result} = renderRecoveryEngine();
        await act(async () => result.current.play());
        const audio = FakeAudio.instances[0];
        act(() => { audio.emit('loadedmetadata'); audio.currentTime = 45; });
        const clearSource = vi.spyOn(audio, 'removeAttribute');
        audio.error = {code: 2};
        act(() => audio.emit('error'));
        expect(result.current.notice).toBe('Reconnecting…');
        act(() => result.current.pause());
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
        expect(clearSource).not.toHaveBeenCalled();

        await act(async () => result.current.play());
        expect(clearSource).toHaveBeenCalledWith('src');
        act(() => audio.emit('loadedmetadata'));
        expect(audio.currentTime).toBe(45);
        expect(result.current.isPlaying).toBe(true);
    });

    it('does not retry decoding or unsupported-source failures', async () => {
        const {result} = renderRecoveryEngine();
        await act(async () => result.current.play());
        const audio = FakeAudio.instances[0];
        audio.error = {code: 4};
        act(() => audio.emit('error'));
        expect(result.current.error).toContain('could not be loaded');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not start playing when authorization completes after a pause', async () => {
        const access = deferred<{accessKey: string; expiresAt: number}>();
        mediaAccess.requestMediaAccess.mockReturnValueOnce(access.promise);
        const {result} = renderRecoveryEngine();
        act(() => result.current.play());
        act(() => result.current.pause());
        await act(async () => access.resolve({accessKey: 'later', expiresAt: Date.now() + 60_000}));
        expect(FakeAudio.instances).toHaveLength(0);
        expect(result.current.isPlaying).toBe(false);
    });
});


class FakeAudioContext {
    state = 'running';
    destination = {};
    onstatechange: (() => void) | null = null;
    resume = vi.fn(async () => { this.state = 'running'; });
    close = vi.fn(async () => {});
    createAnalyser = vi.fn(() => ({connect() {}, disconnect() {}, fftSize: 2048}));
    createMediaElementSource = vi.fn(() => ({connect() {}, disconnect() {}}));

    interrupt() {
        this.state = 'interrupted';
        this.onstatechange?.();
    }
}

describe('audio context recovery', () => {
    let context: FakeAudioContext;
    beforeEach(() => {
        vi.useFakeTimers();
        context = new FakeAudioContext();
        vi.stubGlobal('AudioContext', vi.fn(function () { return context; }));
        mediaAccess.requestMediaAccess.mockResolvedValue({accessKey: 'valid-key', expiresAt: Date.now() + 60_000});
    });

    async function start() {
        const engine = renderRecoveryEngine();
        await act(async () => engine.result.current.play());
        act(() => FakeAudio.instances[0].emit('loadedmetadata'));
        await act(async () => engine.result.current.enableAudioLevels());
        expect(context.createMediaElementSource).toHaveBeenCalledOnce();
        return engine;
    }

    it('recovers an interruption while visible without reopening immersive mode', async () => {
        const {result} = await start();
        await act(async () => context.interrupt());
        expect(context.state).toBe('running');
        expect(result.current.isPlaying).toBe(true);
        expect(result.current.notice).toBeNull();
        expect(context.createMediaElementSource).toHaveBeenCalledOnce();
        expect(mediaAccess.requestMediaAccess).toHaveBeenCalledOnce();
    });

    it.each(['visibilitychange', 'pageshow'])('recovers on %s after returning to the page', async event => {
        const {result} = await start();
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        try {
            act(() => context.interrupt());
            expect(context.resume).not.toHaveBeenCalled();
            hidden.mockReturnValue(false);
            await act(async () => (event === 'pageshow' ? window : document).dispatchEvent(new Event(event)));
            expect(context.state).toBe('running');
            expect(result.current.isPlaying).toBe(true);
        } finally {
            hidden.mockRestore();
        }
    });

    it.each(['reject', 'pending', 'interrupted'])('offers a working play retry when resume is %s', async failure => {
        const {result} = await start();
        if (failure === 'reject') context.resume.mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'));
        else if (failure === 'pending') context.resume.mockImplementation(() => new Promise(() => {}));
        else context.resume.mockImplementation(async () => {});
        await act(async () => context.interrupt());
        await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
        expect(result.current.isPlaying).toBe(false);
        expect(FakeAudio.instances[0].paused).toBe(true);
        expect(result.current.notice).toBe('Ready to play — press play to continue.');
        context.resume.mockImplementation(async () => { context.state = 'running'; });
        await act(async () => result.current.play());
        expect(result.current.isPlaying).toBe(true);
        expect(result.current.notice).toBeNull();
        expect(FakeAudio.instances).toHaveLength(1);
        expect(mediaAccess.requestMediaAccess).toHaveBeenCalledOnce();
    });

    it.each(['pause', 'resetForTrack'] as const)('does not recover after %s', async action => {
        const {result} = await start();
        act(() => result.current[action]());
        await act(async () => context.interrupt());
        await act(async () => document.dispatchEvent(new Event('visibilitychange')));
        expect(context.resume).not.toHaveBeenCalled();
        expect(FakeAudio.instances[0].paused).toBe(true);
    });

    it('ignores a failed recovery completed after a pause', async () => {
        const {result} = await start();
        const pending = deferred<void>();
        context.resume.mockReturnValue(pending.promise);
        await act(async () => context.interrupt());
        act(() => result.current.pause());
        await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
        expect(result.current.notice).toBeNull();
        expect(result.current.isPlaying).toBe(false);
        await act(async () => pending.resolve());
        expect(FakeAudio.instances[0].paused).toBe(true);
    });

    it('removes recovery listeners when unmounted', async () => {
        const {unmount} = await start();
        unmount();
        context.interrupt();
        window.dispatchEvent(new Event('pageshow'));
        document.dispatchEvent(new Event('visibilitychange'));
        expect(context.resume).not.toHaveBeenCalled();
        expect(context.close).toHaveBeenCalledOnce();
        expect(context.onstatechange).toBeNull();
    });
});
