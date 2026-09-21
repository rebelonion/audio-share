/** @vitest-environment jsdom */

import {useState} from 'react';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import MatureContentDialog from './MatureContentDialog';
import {useImmersiveControls} from './immersive/useImmersiveControls';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('focuses the confirmation on opening without stealing focus on rerenders', () => {
    const view = render(<MatureContentDialog open={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    view.rerender(<MatureContentDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Close'}));
    const confirm = screen.getByRole('button', {name: 'Continue'});
    confirm.focus();
    view.rerender(<MatureContentDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(document.activeElement).toBe(confirm);
});

it('wraps both tab boundaries and preserves normal navigation between buttons', () => {
    render(<MatureContentDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const first = screen.getByRole('button', {name: 'Close'});
    const last = screen.getByRole('button', {name: 'Continue'});
    last.focus();
    expect(fireEvent.keyDown(last, {key: 'Tab'})).toBe(false);
    expect(document.activeElement).toBe(first);
    expect(fireEvent.keyDown(first, {key: 'Tab', shiftKey: true})).toBe(false);
    expect(document.activeElement).toBe(last);
    const cancel = screen.getByRole('button', {name: 'Cancel'});
    cancel.focus();
    expect(fireEvent.keyDown(cancel, {key: 'Tab'})).toBe(true);
    expect(fireEvent.keyDown(cancel, {key: 'Tab', shiftKey: true})).toBe(true);
});

it.each(['Close', 'Cancel', 'Continue', 'Escape'])('restores focus after dismissal with %s', action => {
    const onConfirm = vi.fn();
    function Harness() {
        const [open, setOpen] = useState(false);
        return <>
            <button onClick={() => setOpen(true)}>Open confirmation</button>
            <MatureContentDialog open={open} onCancel={() => setOpen(false)} onConfirm={() => {
                onConfirm();
                setOpen(false);
            }} />
        </>;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', {name: 'Open confirmation'});
    opener.focus();
    fireEvent.click(opener);
    if (action === 'Escape') fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    else {
        const button = screen.getByRole('button', {name: action});
        button.focus();
        fireEvent.click(button);
    }
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(onConfirm).toHaveBeenCalledTimes(action === 'Continue' ? 1 : 0);
});

it('keeps immersive keyboard handling suspended until the confirmation closes', () => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()}));
    const rect = new DOMRect(0, 0, 44, 44);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(Object.assign([rect], {item: () => rect}));
    const leaveImmersive = vi.fn();
    const playbackShortcut = vi.fn();
    function Harness() {
        const [open, setOpen] = useState(false);
        const {rootRef, closeRef} = useImmersiveControls(leaveImmersive);
        return <>
            <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Immersive player">
                <button ref={closeRef}>Exit immersive player</button>
                <button onClick={() => setOpen(true)}>Play mature track</button>
            </div>
            <MatureContentDialog open={open} onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)} />
        </>;
    }
    window.addEventListener('keydown', playbackShortcut);
    try {
        render(<Harness />);
        const opener = screen.getByRole('button', {name: 'Play mature track'});
        opener.focus();
        fireEvent.click(opener);
        const confirmation = within(screen.getByRole('dialog', {name: 'Mature content'}));
        const first = confirmation.getByRole('button', {name: 'Close'});
        const last = confirmation.getByRole('button', {name: 'Continue'});
        expect(document.activeElement).toBe(first);
        fireEvent.keyDown(first, {key: 'Tab', shiftKey: true});
        expect(document.activeElement).toBe(last);
        fireEvent.keyDown(last, {key: 'Tab'});
        expect(document.activeElement).toBe(first);
        fireEvent.keyDown(first, {key: 'k'});
        expect(playbackShortcut).not.toHaveBeenCalled();
        fireEvent.keyDown(first, {key: 'Escape'});
        expect(screen.queryByRole('dialog', {name: 'Mature content'})).toBeNull();
        expect(document.activeElement).toBe(opener);
        expect(leaveImmersive).not.toHaveBeenCalled();
        fireEvent.keyDown(opener, {key: 'Escape'});
        expect(leaveImmersive).toHaveBeenCalledOnce();
    } finally {
        window.removeEventListener('keydown', playbackShortcut);
    }
});
