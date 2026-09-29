/** @vitest-environment jsdom */

import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ToastProvider} from '@/contexts/ToastContext';
import TrackQuickActions from './TrackQuickActions';

const playerCommands = vi.hoisted(() => ({
    addToQueue: vi.fn(() => 'queued'),
    playNext: vi.fn(() => 'queued'),
}));

const likes = vi.hoisted(() => ({
    toggleLike: vi.fn(async () => true),
    isLikePending: vi.fn(() => false),
}));

vi.mock('@/contexts/AudioPlayerContext', () => ({
    useAudioPlayerCommands: () => playerCommands,
}));

vi.mock('@/contexts/LikesContext', () => ({
    useLikes: () => ({
        isLiked: () => false,
        isLikePending: likes.isLikePending,
        isLoading: false,
        isReady: true,
        toggleLike: likes.toggleLike,
    }),
}));

const track = {
    src: '/audio/key/track-key',
    shareKey: 'track-key',
    name: 'Test track',
};

function Harness() {
    const [showActions, setShowActions] = useState(true);

    return (
        <>
            {showActions && <TrackQuickActions track={track}/>}
            <button onClick={() => setShowActions(false)}>remove actions</button>
        </>
    );
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    likes.isLikePending.mockReturnValue(false);
});

describe('TrackQuickActions', () => {
    it('does not activate the track row when a pending like or its icon is clicked', () => {
        likes.isLikePending.mockReturnValue(true);
        const playTrack = vi.fn();
        render(<ToastProvider><div onClick={playTrack}><TrackQuickActions track={track} /></div></ToastProvider>);

        const button = screen.getByRole('button', {name: 'Like track'}) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        fireEvent.click(button);
        fireEvent.click(button.querySelector('svg')!);

        expect(playTrack).not.toHaveBeenCalled();
        expect(likes.toggleLike).not.toHaveBeenCalled();
    });

    it('publishes action feedback through the global toast provider', () => {
        render(
            <ToastProvider>
                <Harness/>
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', {name: 'Add to queue'}));
        fireEvent.click(screen.getByRole('button', {name: 'remove actions'}));

        expect(screen.getByRole('status').textContent).toBe('Added to queue');
    });
});
