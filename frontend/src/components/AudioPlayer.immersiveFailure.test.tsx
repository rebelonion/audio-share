/** @vitest-environment jsdom */

import {useEffect} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {ToastProvider} from '@/contexts/ToastContext';
import AudioPlayer from './AudioPlayer';

const togglePlay = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AudioPlayerContext', () => ({
    useGlobalAudioPlayer: () => ({
        currentTrack: {id: 'track', shareKey: 'key', name: 'Recording'},
        upcoming: [], currentTime: 15, duration: 120, volume: 1,
        isPlaying: true, audioLoaded: true, togglePlay,
    }),
}));
vi.mock('@/contexts/LikesContext', () => ({
    useLikes: () => ({isLiked: () => false, isLikePending: () => false}),
}));
vi.mock('@/hooks/useAudioPlayerKeybinds', () => ({useAudioPlayerKeybinds: vi.fn()}));
vi.mock('@/components/WaveformDisplay', () => ({default: () => null}));
vi.mock('@/lib/errorReporting', () => ({reportError: vi.fn()}));
vi.mock('./immersive/ImmersivePlayer', () => {
    throw new TypeError('Failed to fetch dynamically imported module');
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('preserves the ordinary player and its parent when the immersive download fails', async () => {
    const parentUnmounted = vi.fn();
    function PlaybackParent() {
        useEffect(() => parentUnmounted, []);
        return <ToastProvider><AudioPlayer /></ToastProvider>;
    }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: () => ({matches: false, addEventListener() {}, removeEventListener() {}}),
    });
    render(<PlaybackParent />);
    fireEvent.click(screen.getByRole('button', {name: 'Open immersive player'}));
    expect((await screen.findByRole('alert')).textContent).toContain('Immersive player could not be opened');
    expect(parentUnmounted).not.toHaveBeenCalled();
    expect(togglePlay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Pause'}));
    expect(togglePlay).toHaveBeenCalledOnce();
});
