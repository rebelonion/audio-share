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
}));

vi.mock('@/contexts/AudioPlayerContext', () => ({
    useAudioPlayerCommands: () => playerCommands,
}));

vi.mock('@/contexts/LikesContext', () => ({
    useLikes: () => ({
        isLiked: () => false,
        isLikePending: () => false,
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
});

describe('TrackQuickActions', () => {
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
