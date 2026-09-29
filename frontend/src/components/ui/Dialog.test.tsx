/** @vitest-environment jsdom */

import {StrictMode, useState} from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import Dialog from './Dialog';

afterEach(cleanup);

it('isolates stacked dialogs and restores background state and focus after dismissal', () => {
    function Harness() {
        const [first, setFirst] = useState(false);
        const [second, setSecond] = useState(false);
        return <>
            <button onClick={() => setFirst(true)}>Open first</button>
            <Dialog open={first} onClose={() => setFirst(false)} labelledBy="first-title">
                <h2 id="first-title">First dialog</h2>
                <button onClick={() => setSecond(true)}>Open second</button>
            </Dialog>
            <Dialog open={second} onClose={() => setSecond(false)} labelledBy="second-title">
                <h2 id="second-title">Second dialog</h2>
                <button onClick={() => setSecond(false)}>Close second</button>
            </Dialog>
        </>;
    }
    const {container} = render(<StrictMode><Harness /></StrictMode>);
    const opener = screen.getByRole('button', {name: 'Open first'});
    opener.focus();
    fireEvent.click(opener);
    const first = screen.getByRole('dialog', {name: 'First dialog'});
    const secondOpener = screen.getByRole('button', {name: 'Open second'});
    expect(container.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(secondOpener);
    fireEvent.click(secondOpener);
    expect(first.parentElement!.hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    expect(first.parentElement!.hasAttribute('inert')).toBe(false);
    expect(container.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(secondOpener);
    fireEvent.click(first.parentElement!);
    expect(container.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
});

it('isolates new body portals and preserves preexisting inert and scroll state', async () => {
    const background = document.createElement('div');
    background.setAttribute('inert', '');
    document.body.append(background);
    const latePortal = document.createElement('div');
    document.body.style.overflow = 'clip';
    const {unmount} = render(<Dialog open onClose={vi.fn()} labelledBy="title"><h2 id="title">Notice</h2></Dialog>);
    document.body.append(latePortal);
    try {
        await waitFor(() => expect(latePortal.hasAttribute('inert')).toBe(true));
        unmount();
        expect(background.hasAttribute('inert')).toBe(true);
        expect(latePortal.hasAttribute('inert')).toBe(false);
        expect(document.body.style.overflow).toBe('clip');
    } finally {
        background.remove();
        latePortal.remove();
        document.body.style.overflow = '';
    }
});

it('does not dismiss for a click inside the dialog', () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} labelledBy="title"><h2 id="title">Notice</h2></Dialog>);
    fireEvent.click(screen.getByRole('heading', {name: 'Notice'}));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
});
