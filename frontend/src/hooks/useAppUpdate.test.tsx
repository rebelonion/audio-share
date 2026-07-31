/** @vitest-environment jsdom */

import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useAppUpdate} from './useAppUpdate';

vi.mock('@/lib/config', () => ({
    BUILD_ID: 'build-current',
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('useAppUpdate', () => {
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
