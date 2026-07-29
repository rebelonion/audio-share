/** @vitest-environment jsdom */

import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useState} from 'react';
import {MemoryRouter} from 'react-router';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ToastProvider} from '@/contexts/ToastContext';
import {MediaAccessError} from '@/lib/mediaAccess';
import FolderView from './FolderView';

const mediaAccess = vi.hoisted(() => ({
    startAudioDownload: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
    track: vi.fn(),
}));

vi.mock('@/lib/mediaAccess', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/mediaAccess')>(),
    startAudioDownload: mediaAccess.startAudioDownload,
}));

vi.mock('@/hooks/useRybbit', () => ({
    useRybbit: () => analytics,
}));

vi.mock('@/contexts/AudioPlayerContext', () => ({
    useAudioPlayerCommands: () => ({playContext: vi.fn()}),
}));

vi.mock('@/components/TrackQuickActions', () => ({
    default: () => null,
}));

const track = {
    name: 'Test track.m4a',
    path: 'youtube/Test/Test track.m4a',
    size: 40_000,
    modifiedAt: '2026-01-01T00:00:00Z',
    type: 'audio' as const,
    mimeType: 'audio/mp4',
    title: 'Test track',
    shareKey: 'track-key',
};

function Harness() {
    const [showFolder, setShowFolder] = useState(true);

    return (
        <>
            {showFolder && <FolderView items={[track]} currentPath="youtube/Test"/>}
            <button onClick={() => setShowFolder(false)}>remove folder</button>
        </>
    );
}

beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    });
    window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = handle => window.clearTimeout(handle);
    window.scrollTo = vi.fn();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('FolderView', () => {
    it('publishes download failures through the global toast provider', async () => {
        mediaAccess.startAudioDownload.mockRejectedValueOnce(
            new MediaAccessError(429, 'rate_limited', 3_600),
        );
        render(
            <ToastProvider>
                <MemoryRouter>
                    <Harness/>
                </MemoryRouter>
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', {name: 'Download'}));
        await waitFor(() => expect(mediaAccess.startAudioDownload).toHaveBeenCalledWith(
            'track-key',
            expect.any(Function),
        ));
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', {name: 'remove folder'}));

        expect(screen.getByRole('alert').textContent).toBe('Too many downloads. Try again in 1 hour.');
        expect(analytics.track).not.toHaveBeenCalledWith(
            'audio-download',
            expect.anything(),
        );
    });

    it('tracks a download only after authorization succeeds', async () => {
        mediaAccess.startAudioDownload.mockResolvedValueOnce(undefined);
        render(
            <ToastProvider>
                <MemoryRouter>
                    <Harness/>
                </MemoryRouter>
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', {name: 'Download'}));

        await waitFor(() => expect(analytics.track).toHaveBeenCalledWith(
            'audio-download',
            {path: track.path, name: track.name},
        ));
    });

    it('shows when a download captcha is being verified', async () => {
        let finishDownload: (() => void) | undefined;
        mediaAccess.startAudioDownload.mockImplementationOnce((_shareKey, onPhase) => {
            onPhase?.('verifying');
            return new Promise<void>(resolve => {
                finishDownload = resolve;
            });
        });
        render(
            <ToastProvider>
                <MemoryRouter>
                    <Harness/>
                </MemoryRouter>
            </ToastProvider>,
        );

        fireEvent.click(screen.getByRole('button', {name: 'Download'}));

        const status = await screen.findByRole('status');
        expect(status.textContent).toBe('Verifying download…');
        expect(mediaAccess.startAudioDownload).toHaveBeenCalledWith(
            'track-key',
            expect.any(Function),
        );

        finishDownload?.();
        await waitFor(() => expect(screen.queryByText('Verifying download…')).toBeNull());
    });
});
