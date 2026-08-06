/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RequestSourceDialog from './RequestSourceDialog';

const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }));

vi.mock('@/hooks/useRybbit', () => ({
    useRybbit: () => ({ track: trackMock }),
}));

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    trackMock.mockReset();
});

describe('RequestSourceDialog', () => {
    it('sends the higher removal risk selection with the request', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        render(<RequestSourceDialog isOpen onCloseAction={vi.fn()} />);

        fireEvent.change(screen.getByLabelText('Artist or channel URL'), {
            target: { value: 'https://youtube.com/@example' },
        });
        fireEvent.click(screen.getByText('This channel has a higher chance of having content removed'));
        fireEvent.click(screen.getByText('I understand these rules'));
        fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

        const [, init] = fetchMock.mock.calls[0];
        expect(JSON.parse(String(init?.body))).toEqual({
            requestUrl: 'https://youtube.com/@example',
            hasHigherRemovalRisk: true,
        });
        expect(trackMock).toHaveBeenCalledWith('artist-request');
    });

    it('shows the duplicate message returned by the backend', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({
                code: 'source_exists',
                error: 'This source is already in the archive.',
                existing: {
                    folderPath: 'Audio/Mao Chika',
                },
            }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        render(
            <MemoryRouter>
                <RequestSourceDialog isOpen onCloseAction={vi.fn()} />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByLabelText('Artist or channel URL'), {
            target: { value: 'https://m.youtube.com/@example' },
        });
        fireEvent.click(screen.getByText('I understand these rules'));
        fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

        expect(await screen.findByText('This source is already in the archive.')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Browse' }).getAttribute('href'))
            .toBe('/browse/Audio/Mao%20Chika');
        expect(trackMock).toHaveBeenCalledWith('artist-request-failed', {
            reason: 'source_exists',
            status: 409,
            requestUrl: 'https://m.youtube.com/@example',
        });
        expect(trackMock).not.toHaveBeenCalledWith('artist-request');
    });

    it('tracks request errors with the requested URL', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        render(<RequestSourceDialog isOpen onCloseAction={vi.fn()} />);

        fireEvent.change(screen.getByLabelText('Artist or channel URL'), {
            target: { value: 'https://youtube.com/@example' },
        });
        fireEvent.click(screen.getByText('I understand these rules'));
        fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

        await waitFor(() => expect(trackMock).toHaveBeenCalledWith(
            'artist-request-failed',
            {
                reason: 'request_error',
                requestUrl: 'https://youtube.com/@example',
            },
        ));
    });
});
