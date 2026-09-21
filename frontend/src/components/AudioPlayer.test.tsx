/** @vitest-environment jsdom */

import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ToastProvider} from '@/contexts/ToastContext';
import AudioPlayer from './AudioPlayer';

const analytics = vi.hoisted(() => ({track: vi.fn()}));
vi.mock('@/hooks/useRybbit', () => ({useRybbit: () => analytics}));

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
        seekBy: vi.fn(),
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

vi.mock('./immersive/scenes/traveler/TravelerScene', () => ({default: () => <canvas aria-hidden="true" />}));
vi.mock('./immersive/scenes/night-train/NightTrainScene', () => ({default: () => <canvas aria-label="Night train scenery" />}));
vi.mock('./immersive/scenes/shrine-path/ShrinePathScene', () => ({default: () => <canvas aria-label="Shrine path scenery" />}));

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
    localStorage.clear();
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

describe('immersive player', () => {
    it.each([false, true])('highlights discovery once and tracks entry and exit (compact: %s)', async compact => {
        setMobile(compact);
        const view = render(<ToastProvider><AudioPlayer /></ToastProvider>);
        const opener = screen.getByRole('button', {name: 'Open immersive player'});
        expect(within(opener).getByText('New')).toBeTruthy();
        fireEvent.click(opener);
        const dialog = await screen.findByRole('dialog', {name: 'Immersive player'});
        expect(analytics.track).toHaveBeenCalledWith('immersive-player-open', {
            entryPoint: compact ? 'compact' : 'expanded', highlighted: true,
        });
        expect(analytics.track.mock.calls.filter(([event]) => event === 'immersive-player-open')).toHaveLength(1);
        fireEvent.keyDown(within(dialog).getByRole('button', {name: 'Exit immersive player'}), {key: 'Escape'});
        expect(analytics.track).toHaveBeenCalledWith('immersive-player-close', {scene: 'traveler'});
        expect(localStorage.getItem('audio-share:immersive-discovered')).toBe('true');
        view.unmount();
        render(<ToastProvider><AudioPlayer /></ToastProvider>);
        const returningOpener = screen.getByRole('button', {name: 'Open immersive player'});
        expect(within(returningOpener).queryByText('New')).toBeNull();
        fireEvent.click(returningOpener);
        await screen.findByRole('dialog', {name: 'Immersive player'});
        expect(analytics.track).toHaveBeenCalledWith('immersive-player-open', {
            entryPoint: compact ? 'compact' : 'expanded', highlighted: false,
        });
    });

    it.each([
        [false, 'Night train', 'Countryside after dark · waveform unavailable'],
        [true, 'Night train', 'Countryside after dark · waveform unavailable'],
        [false, 'Shrine path', 'Torii gates and lanterns at dusk · waveform unavailable'],
        [true, 'Shrine path', 'Torii gates and lanterns at dusk · waveform unavailable'],
    ] as const)('can switch scenes without interrupting audio (mobile: %s, scene: %s)', async (mobile, scene, caption) => {
        setMobile(mobile);
        render(<ToastProvider><AudioPlayer /></ToastProvider>);
        fireEvent.click(screen.getByRole('button', {name: 'Open immersive player'}));
        const dialog = within(await screen.findByRole('dialog', {name: 'Immersive player'}));
        fireEvent.click(dialog.getByRole('button', {name: 'Scene'}));
        fireEvent.click(dialog.getByRole('option', {name: scene}));
        expect(await dialog.findByLabelText(`${scene} scenery`)).toBeTruthy();
        expect(dialog.getByText(caption)).toBeTruthy();
        expect(analytics.track).toHaveBeenCalledWith('immersive-scene-change', {
            from: 'traveler', to: scene === 'Night train' ? 'night-train' : 'shrine-path',
        });
        expect(player.value.togglePlay).not.toHaveBeenCalled();
        expect(player.value.closePlayer).not.toHaveBeenCalled();
        fireEvent.click(dialog.getByRole('button', {name: 'Scene'}));
        fireEvent.click(dialog.getByRole('option', {name: 'Traveler'}));
        await waitFor(() => expect(dialog.queryByLabelText(`${scene} scenery`)).toBeNull());
    });

    it.each([false, true])('opens and exits without interrupting audio (mobile: %s)', async mobile => {
        setMobile(mobile);
        render(<ToastProvider><AudioPlayer /></ToastProvider>);
        const opener = screen.getByRole('button', {name: 'Open immersive player'});
        opener.focus();
        fireEvent.click(opener);
        const dialog = await screen.findByRole('dialog', {name: 'Immersive player'});
        const exit = within(dialog).getByRole('button', {name: 'Exit immersive player'});
        expect(document.activeElement).toBe(exit);
        expect(document.body.style.overflow).toBe('hidden');
        fireEvent.keyDown(exit, {key: 'Escape'});
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Immersive player'})).toBeNull());
        expect(document.activeElement).toBe(opener);
        expect(document.body.style.overflow).toBe('');
        expect(player.value.closePlayer).not.toHaveBeenCalled();
        expect(player.value.togglePlay).not.toHaveBeenCalled();
    });

    it('uses the shared transport and provides a fallback when waveform data is absent', async () => {
        setMobile(false);
        render(<ToastProvider><AudioPlayer /></ToastProvider>);
        fireEvent.click(screen.getByRole('button', {name: 'Open immersive player'}));
        const dialog = within(await screen.findByRole('dialog', {name: 'Immersive player'}));
        fireEvent.click(dialog.getByRole('button', {name: 'Play'}));
        fireEvent.change(dialog.getByRole('slider', {name: 'Playback position'}), {target: {value: '45'}});
        fireEvent.click(dialog.getByRole('button', {name: 'Next track'}));
        expect(player.value.togglePlay).toHaveBeenCalledOnce();
        expect(player.value.seekTo).toHaveBeenCalledWith(45);
        expect(player.value.skipNext).toHaveBeenCalledOnce();
        expect(dialog.getByText('Scenic terrain · waveform unavailable')).toBeDefined();
        const stillScene = dialog.getByRole('button', {name: 'Still scene'});
        fireEvent.click(stillScene);
        expect(stillScene.getAttribute('aria-pressed')).toBe('true');
        expect(analytics.track).toHaveBeenCalledWith('immersive-motion-change', {scene: 'traveler', motion: false});
    });

    it('lets a playback confirmation above the traveler receive keyboard focus', async () => {
        setMobile(false);
        const rect = new DOMRect(0, 0, 44, 44);
        const visible = vi.spyOn(HTMLElement.prototype, 'getClientRects')
            .mockReturnValue(Object.assign([rect], {item: () => rect}));
        const confirmation = document.createElement('div');
        confirmation.setAttribute('role', 'dialog');
        confirmation.setAttribute('aria-modal', 'true');
        const confirm = document.createElement('button');
        confirm.textContent = 'Continue playback';
        confirmation.append(confirm);
        try {
            render(<ToastProvider><AudioPlayer /></ToastProvider>);
            fireEvent.click(screen.getByRole('button', {name: 'Open immersive player'}));
            const traveler = await screen.findByRole('dialog', {name: 'Immersive player'});
            document.body.append(confirmation);
            fireEvent.keyDown(within(traveler).getByRole('button', {name: 'Exit immersive player'}), {key: 'Tab'});
            expect(document.activeElement).toBe(confirm);
            fireEvent.keyDown(confirm, {key: 'Escape'});
            expect(screen.getByRole('dialog', {name: 'Immersive player'})).toBe(traveler);
        } finally {
            confirmation.remove();
            visible.mockRestore();
        }
    });
});

describe('AudioPlayer sharing', () => {
    it('seeks backward 10 seconds and forward 30 seconds', () => {
        setMobile(false);
        render(
            <ToastProvider>
                <AudioPlayer/>
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', {name: 'Seek backward 10 seconds'}));
        fireEvent.click(screen.getByRole('button', {name: 'Seek forward 30 seconds'}));

        expect(player.value.seekBy).toHaveBeenNthCalledWith(1, -10);
        expect(player.value.seekBy).toHaveBeenNthCalledWith(2, 30);
    });

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
