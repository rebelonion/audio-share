/** @vitest-environment jsdom */

import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import CloudflareChallengeRecovery from './CloudflareChallengeRecovery';
import {CLOUDFLARE_CHALLENGE_EVENT} from '@/lib/cloudflareChallenge';

beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
        configurable: true,
        value: vi.fn(function (this: HTMLDialogElement) {
            this.setAttribute('open', '');
        }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true,
        value: vi.fn(function (this: HTMLDialogElement) {
            this.removeAttribute('open');
        }),
    });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('Cloudflare challenge recovery', () => {
    it('opens a modal, focuses recovery, and prevents dismissal', () => {
        render(<CloudflareChallengeRecovery />);

        act(() => {
            window.dispatchEvent(new Event(CLOUDFLARE_CHALLENGE_EVENT));
        });

        const dialog = screen.getByRole('alertdialog');
        const reloadButton = screen.getByRole('button', {name: 'Reload and verify'});
        expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(reloadButton);

        const cancelEvent = new Event('cancel', {cancelable: true});
        dialog.dispatchEvent(cancelEvent);
        expect(cancelEvent.defaultPrevented).toBe(true);
    });
});
