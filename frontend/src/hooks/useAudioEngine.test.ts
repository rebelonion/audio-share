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

    private emit(name: string) {
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
});

describe('useAudioEngine', () => {
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
