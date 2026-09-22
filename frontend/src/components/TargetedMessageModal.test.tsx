/** @vitest-environment jsdom */

import {StrictMode} from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import TargetedMessageModal from './TargetedMessageModal';

function installRybbit() {
    const event = vi.fn();
    const rybbit = {
        pageview: vi.fn(),
        event,
        identify: vi.fn(),
        setTraits: vi.fn(),
        clearUserId: vi.fn(),
        getUserId: vi.fn(() => null),
        onReady: vi.fn((callback: (client: NonNullable<Window['rybbit']>) => void) => callback(rybbit)),
        trackOutbound: vi.fn(),
    };
    window.rybbit = rybbit;
    return {event};
}

afterEach(() => {
    cleanup();
    window.rybbit = undefined;
    document.body.style.overflow = '';
    vi.restoreAllMocks();
});

describe('TargetedMessageModal', () => {
    it('renders safely, focuses acknowledgement, and tracks display once', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            id: 42,
            title: 'A direct note',
            message: 'Hello <strong>listener</strong>.',
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        }));
        const {event} = installRybbit();

        render(
            <StrictMode>
                <TargetedMessageModal />
            </StrictMode>,
        );

        const dialog = await screen.findByRole('dialog', {name: 'A direct note'});
        expect(dialog.textContent).toContain('Hello <strong>listener</strong>.');
        expect(dialog.querySelector('strong')).toBeNull();
        expect(screen.getByRole('button', {name: 'Got it'})).toBe(document.activeElement);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledWith('/api/session/targeted-message', {
            method: 'POST',
            credentials: 'include',
        });
        expect(event).toHaveBeenCalledOnce();
        expect(event).toHaveBeenCalledWith('targeted-message-displayed', {messageId: 42});

        fireEvent.click(screen.getByRole('button', {name: 'Got it'}));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(document.body.style.overflow).toBe('');
        expect(fetchMock).toHaveBeenLastCalledWith('/api/session/targeted-message', {
            method: 'DELETE',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: 42}),
        });
    });

    it('does not render a modal when there is no pending message', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
            status: 204,
        }));

        render(<TargetedMessageModal />);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it.each(['Escape', 'Close message'])('acknowledges when dismissed with %s', async dismissal => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            id: 7,
            title: 'Notice',
            message: 'This is for you.',
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        }));

        render(<TargetedMessageModal />);
        await screen.findByRole('dialog');
        if (dismissal === 'Escape') fireEvent.keyDown(window, {key: 'Escape'});
        else fireEvent.click(screen.getByRole('button', {name: dismissal}));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(fetchMock).toHaveBeenLastCalledWith('/api/session/targeted-message', expect.objectContaining({
            method: 'DELETE', body: JSON.stringify({id: 7}),
        }));
    });

    it('does not acknowledge a message when unmounted without dismissal', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            id: 42, title: 'Notice', message: 'Please read this.',
        })));
        const {unmount} = render(<TargetedMessageModal />);
        await screen.findByRole('dialog');
        unmount();
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('allows redelivery on the next visit if acknowledgement fails', async () => {
        const note = {id: 42, title: 'Notice', message: 'Please read this.'};
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify(note)))
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(new Response(JSON.stringify(note)));
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const {unmount} = render(<TargetedMessageModal />);
        await screen.findByRole('dialog');
        fireEvent.click(screen.getByRole('button', {name: 'Got it'}));
        await waitFor(() => expect(errorLog).toHaveBeenCalled());
        expect(screen.queryByRole('dialog')).toBeNull();
        unmount();
        render(<TargetedMessageModal />);
        await screen.findByRole('dialog');
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
