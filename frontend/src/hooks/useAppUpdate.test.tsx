/** @vitest-environment jsdom */

import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useAppUpdate} from './useAppUpdate';

vi.mock('@/lib/config', () => ({
    BUILD_ID: 'build-current',
    ERROR_REPORTING: false,
}));

function UpdateProbe() {
    return <div>{useAppUpdate() ? 'update available' : 'up to date'}</div>;
}

function versionResponse(buildId: string) {
    return {
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({buildId}),
    };
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('useAppUpdate', () => {
    it('aborts a stalled check after ten seconds and allows a later check', async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        vi.mocked(fetch).mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })).mockResolvedValue(versionResponse('build-next') as unknown as Response);

        render(<UpdateProbe />);
        await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
        expect(signal?.aborted).toBe(true);
        expect(screen.getByText('up to date')).toBeTruthy();

        await act(async () => { window.dispatchEvent(new Event('online')); });
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(screen.getByText('update available')).toBeTruthy();
    });

    it('stays quiet when the deployed build matches the loaded build', async () => {
        vi.mocked(fetch).mockResolvedValue(versionResponse('build-current') as unknown as Response);

        render(<UpdateProbe />);

        await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/version', {
            cache: 'no-store',
            signal: expect.any(AbortSignal),
        }));
        expect(screen.getByText('up to date')).toBeTruthy();
    });

    it('reports an update when the deployed build changes', async () => {
        vi.mocked(fetch).mockResolvedValue(versionResponse('build-next') as unknown as Response);

        render(<UpdateProbe />);

        expect(await screen.findByText('update available')).toBeTruthy();
    });

    it('ignores failed version checks', async () => {
        vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));

        render(<UpdateProbe />);

        await waitFor(() => expect(fetch).toHaveBeenCalled());
        expect(screen.getByText('up to date')).toBeTruthy();
    });
});
