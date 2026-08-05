/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RequestSourceDialog from './RequestSourceDialog';

vi.mock('@/hooks/useRybbit', () => ({
    useRybbit: () => ({ track: vi.fn() }),
}));

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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
    });
});
