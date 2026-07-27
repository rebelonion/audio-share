/** @vitest-environment jsdom */

import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ToastProvider} from '@/contexts/ToastContext';
import AudioPlayer from './AudioPlayer';

const clipboard = vi.hoisted(() => ({
    writeText: vi.fn(),
}));

const player = vi.hoisted(() => ({
    value: {
        currentTrack: {
            id: 'first',
            src: '/audio/key/first/key',
            shareKey: 'first/key',
            name: 'First track',
            source: 'browse',
        },
        isPlaying: false,
        duration: 120,
        currentTime: 0,
        volume: 1,
        isMuted: false,
        error: null,
        thumbnail: null,
        metadata: null,
        audioLoaded: true,
        isLoading: false,
        artist: 'Artist',
        track: 'First track',
        waveformPeaks: null,
        upcoming: [],
        skipNext: vi.fn(),
        skipPrevious: vi.fn(),
        closePlayer: vi.fn(),
        togglePlay: vi.fn(),
        toggleMute: vi.fn(),
        seekTo: vi.fn(),
        setVolume: vi.fn(),
    },
}));

vi.mock('@/contexts/AudioPlayerContext', () => ({
    useGlobalAudioPlayer: () => player.value,
}));

vi.mock('@/contexts/LikesContext', () => ({
    useLikes: () => ({
        isLiked: () => false,
        isLikePending: () => false,
        isLoading: false,
        isReady: true,
        toggleLike: vi.fn(),
    }),
}));

vi.mock('@/hooks/useAudioPlayerKeybinds', () => ({
    useAudioPlayerKeybinds: vi.fn(),
}));

function setMobile(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({
            matches,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    });
}

beforeEach(() => {
    setMobile(true);
    player.value.currentTrack = {
        id: 'first',
        src: '/audio/key/first/key',
        shareKey: 'first/key',
        name: 'First track',
        source: 'browse',
    };
    player.value.track = 'First track';
    clipboard.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: clipboard,
    });
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('AudioPlayer sharing', () => {
    it('copies the current canonical link after autoplay advances', async () => {
        setMobile(false);
        const view = render(
            <ToastProvider>
                <AudioPlayer/>
            </ToastProvider>,
        );

        fireEvent.click(await screen.findByRole('button', {name: 'Copy share link'}));
        await waitFor(() => expect(clipboard.writeText).toHaveBeenLastCalledWith(
            'http://localhost:3000/share/first%2Fkey',
        ));
        expect(screen.getByRole('status').textContent).toBe('Share link copied to clipboard!');

        player.value.currentTrack = {
            id: 'autoplay',
            src: '/audio/key/autoplay-key',
            shareKey: 'autoplay-key',
            name: 'Autoplay track',
            source: 'autoplay',
        };
        player.value.track = 'Autoplay track';
        view.rerender(
            <ToastProvider>
                <AudioPlayer/>
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', {name: 'Copy share link'}));
        await waitFor(() => expect(clipboard.writeText).toHaveBeenLastCalledWith(
            'http://localhost:3000/share/autoplay-key',
        ));
    });

    it('keeps maximize instead of share in the minimized player', async () => {
        render(
            <ToastProvider>
                <AudioPlayer/>
            </ToastProvider>,
        );

        expect(await screen.findByRole('button', {name: 'Expand player'})).toBeTruthy();
        expect(screen.queryByRole('button', {name: 'Copy share link'})).toBeNull();
    });

    it('shows an error toast when copying from the expanded player fails', async () => {
        setMobile(false);
        clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
        render(
            <ToastProvider>
                <AudioPlayer/>
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', {name: 'Copy share link'}));

        expect((await screen.findByRole('alert')).textContent).toBe('Failed to copy to clipboard');
    });
});
