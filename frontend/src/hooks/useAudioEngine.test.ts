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
