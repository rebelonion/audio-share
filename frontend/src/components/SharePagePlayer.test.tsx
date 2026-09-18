/** @vitest-environment jsdom */

import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import SharePagePlayer from './SharePagePlayer';

const player = vi.hoisted(() => ({
    playTrack: vi.fn(),
    currentTrack: {src: '/audio/key/test'},
    isPlaying: false,
    isLoading: true,
    error: null as string | null,
}));

vi.mock('@/contexts/AudioPlayerContext', () => ({
    useGlobalAudioPlayer: () => player,
}));

afterEach(cleanup);

it('updates playback status after translation replaces its text node', () => {
    const view = <SharePagePlayer src="/audio/key/test" name="Test track" />;
    const {rerender} = render(view);

    for (const state of [
        {isLoading: false, isPlaying: true, error: null, label: 'Currently playing'},
        {isLoading: false, isPlaying: false, error: null, label: 'Paused in player'},
        {isLoading: false, isPlaying: false, error: 'Failed', label: 'Playback failed. Use the player to retry.'},
        {isLoading: true, isPlaying: false, error: null, label: 'Loading in player…'},
    ]) {
        const walker = document.createTreeWalker(screen.getByRole('status'), NodeFilter.SHOW_TEXT);
        const text = walker.nextNode()!;
        const translated = document.createElement('font');
        translated.textContent = 'Translated status';
        text.parentNode!.replaceChild(translated, text);

        Object.assign(player, state);
        rerender(<SharePagePlayer src="/audio/key/test" name="Test track" />);

        expect(screen.getByRole('status').textContent).toBe(state.label);
    }
});
