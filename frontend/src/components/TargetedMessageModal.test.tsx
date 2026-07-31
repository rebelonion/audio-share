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
    });

    it('does not render a modal when there is no pending message', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
            status: 204,
        }));

        render(<TargetedMessageModal />);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes on Escape', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            id: 7,
            title: 'Notice',
            message: 'This is for you.',
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        }));

        render(<TargetedMessageModal />);
        await screen.findByRole('dialog');
        fireEvent.keyDown(window, {key: 'Escape'});

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
