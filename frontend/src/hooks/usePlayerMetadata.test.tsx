/** @vitest-environment jsdom */

import {act, cleanup, renderHook, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {usePlayerMetadata} from './usePlayerMetadata';
import {appFetch} from '@/lib/cloudflareChallenge';
import {loadPlayerWaveform} from '@/lib/playerWaveform';
import type {PlayerTrack} from '@/lib/playerQueue';

vi.mock('@/lib/cloudflareChallenge', () => ({appFetch: vi.fn()}));
vi.mock('@/lib/playerWaveform', () => ({loadPlayerWaveform: vi.fn()}));
vi.mock('@/lib/errorReporting', () => ({reportError: vi.fn()}));

const first: PlayerTrack = {id: 'first', shareKey: 'first', src: '/first', name: 'First', source: 'manual'};
const second: PlayerTrack = {id: 'second', shareKey: 'second', src: '/second', name: 'Second', source: 'manual'};

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('makes playback metadata available before a delayed waveform', async () => {
    let finish!: (waveform: {peaks: string; duration: number}) => void;
    vi.mocked(loadPlayerWaveform).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    vi.mocked(appFetch).mockResolvedValue(new Response(JSON.stringify({title: 'Ready', duration: 120, thumbnail: true})));
    const {result} = renderHook(() => usePlayerMetadata(first));
    await waitFor(() => expect(result.current.metadata?.title).toBe('Ready'));
    expect(result.current.thumbnail).toContain('/first/thumbnail');
    expect(result.current.waveformPeaks).toBeNull();
    await act(async () => finish({peaks: 'AP8=', duration: 120}));
    expect(result.current.waveformPeaks).toEqual(Uint8Array.of(0, 255));
    expect(result.current.metadata?.title).toBe('Ready');
});

it('ignores the previous track waveform when it arrives after a skip', async () => {
    let finish!: (waveform: {peaks: string}) => void;
    vi.mocked(loadPlayerWaveform).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
        .mockResolvedValueOnce({peaks: 'AQI='});
    vi.mocked(appFetch).mockImplementation(async () => new Response(JSON.stringify({title: 'Metadata'})));
    const {result, rerender} = renderHook(({track}) => usePlayerMetadata(track), {initialProps: {track: first}});
    rerender({track: second});
    await waitFor(() => expect(result.current.waveformPeaks).toEqual(Uint8Array.of(1, 2)));
    await act(async () => finish({peaks: 'AP8='}));
    expect(result.current.trackID).toBe('second');
    expect(result.current.waveformPeaks).toEqual(Uint8Array.of(1, 2));
});

it('preserves an available waveform if metadata fails independently', async () => {
    vi.mocked(loadPlayerWaveform).mockResolvedValue({peaks: 'AP8=', duration: 120});
    vi.mocked(appFetch).mockRejectedValue(new Error('offline'));
    const {result} = renderHook(() => usePlayerMetadata(first));
    await waitFor(() => expect(result.current.metadata?.title).toBe('First'));
    expect(result.current.waveformPeaks).toEqual(Uint8Array.of(0, 255));
    expect(result.current.waveformDuration).toBe(120);
});
