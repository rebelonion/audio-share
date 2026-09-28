/** @vitest-environment jsdom */
import {act, cleanup, renderHook} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {AudioPlayerProvider, useGlobalAudioPlayer} from './AudioPlayerContext';

const engine = vi.hoisted(() => ({
    play: vi.fn(), pause: vi.fn(), resetForTrack: vi.fn(), reportError: vi.fn(),
    onEndedRef: {current: () => {}}, audioRef: {current: null},
    seekTo: vi.fn(), setPlaybackRate: vi.fn(),
}));
const recommendations = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAudioEngine', () => ({
    POSITION_STORAGE_KEY: 'audio-share:position',
    useAudioEngine: (options: {onEndedRef: {current: () => void}}) => {
        engine.onEndedRef = options.onEndedRef;
        return {...engine, currentTime: 0, duration: 100, volume: 1, playbackRate: 1};
    },
}));
vi.mock('@/hooks/usePlayerMetadata', () => ({usePlayerMetadata: () => ({metadata: null, waveformDuration: 0})}));
vi.mock('@/hooks/useRybbit', () => ({useRybbit: () => ({track: vi.fn()})}));
vi.mock('@/lib/api', () => ({getRecommendations: recommendations}));
function wrapper({children}: {children: ReactNode}) { return <AudioPlayerProvider>{children}</AudioPlayerProvider>; }
const track = (key: string) => ({src: `/audio/key/${key}`, shareKey: key, name: key, ageLimit: 0});
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('repeats natural ends but lets manual next advance', () => {
    const {result} = renderHook(useGlobalAudioPlayer, {wrapper});
    act(() => result.current.playContext([track('a'), track('b')], 0, 'Test'));
    act(() => result.current.toggleRepeatOne());
    engine.play.mockClear();
    act(() => engine.onEndedRef.current());
    expect(engine.play).toHaveBeenCalledWith(0);
    expect(result.current.currentTrack?.shareKey).toBe('a');
    act(() => result.current.skipNext());
    expect(result.current.currentTrack?.shareKey).toBe('b');
});
it('stops before repeat or autoplay at the end of a track', () => {
    const {result} = renderHook(useGlobalAudioPlayer, {wrapper});
    act(() => result.current.playTrack(track('a')));
    act(() => result.current.toggleRepeatOne());
    act(() => result.current.setSleepTimer('track'));
    engine.play.mockClear();
    act(() => engine.onEndedRef.current());
    expect(engine.pause).toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
    expect(recommendations).not.toHaveBeenCalled();
    expect(result.current.sleepTimer.mode).toBe('off');
});
it('prevents a pending recommendation from starting after the timer expires', async () => {
    vi.useFakeTimers();
    let resolve!: (tracks: unknown[]) => void;
    recommendations.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const {result} = renderHook(useGlobalAudioPlayer, {wrapper});
    act(() => result.current.playTrack(track('a')));
    act(() => result.current.setSleepTimer(1));
    act(() => engine.onEndedRef.current());
    engine.play.mockClear();
    act(() => vi.advanceTimersByTime(60_000));
    expect(recommendations.mock.calls[0][1].aborted).toBe(true);
    await act(async () => resolve([{shareKey: 'b', filename: 'b'}]));
    expect(engine.play).not.toHaveBeenCalled();
    expect(result.current.currentTrack?.shareKey).toBe('a');
});
it('clears timers when the player closes', () => {
    const {result} = renderHook(useGlobalAudioPlayer, {wrapper});
    act(() => result.current.playTrack(track('a')));
    act(() => result.current.setSleepTimer('track'));
    act(() => result.current.closePlayer());
    expect(result.current.sleepTimer.mode).toBe('off');
});
