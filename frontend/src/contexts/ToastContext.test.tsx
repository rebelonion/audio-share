/** @vitest-environment jsdom */

import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ToastProvider, useToast} from './ToastContext';

function ToastProducer() {
    const toast = useToast();

    return (
        <>
            <button onClick={() => toast.success('Saved')}>success</button>
            <button onClick={() => toast.error('Too many downloads. Try again later.')}>error</button>
            {[1, 2, 3, 4, 5].map(number => (
                <button key={number} onClick={() => toast.success(`Message ${number}`)}>
                    message {number}
                </button>
            ))}
        </>
    );
}

function renderProducer() {
    return render(
        <ToastProvider>
            <ToastProducer/>
        </ToastProvider>,
    );
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('ToastProvider', () => {
    it('renders accessible success and error variants', () => {
        renderProducer();

        fireEvent.click(screen.getByRole('button', {name: 'success'}));
        fireEvent.click(screen.getByRole('button', {name: 'error'}));

        expect(screen.getByRole('status').textContent).toBe('Saved');
        expect(screen.getByRole('alert').textContent).toBe('Too many downloads. Try again later.');
    });

    it('keeps the newest four messages in insertion order', () => {
        renderProducer();

        for (const number of [1, 2, 3, 4, 5]) {
            fireEvent.click(screen.getByRole('button', {name: `message ${number}`}));
        }

        const messages = screen.getAllByRole('status').map(element => element.textContent);
        expect(messages).toEqual(['Message 2', 'Message 3', 'Message 4', 'Message 5']);
    });

    it('cleans up timers when messages are evicted and the provider unmounts', () => {
        vi.useFakeTimers();
        const clearTimeout = vi.spyOn(window, 'clearTimeout');
        const {unmount} = renderProducer();

        for (const number of [1, 2, 3, 4, 5]) {
            fireEvent.click(screen.getByRole('button', {name: `message ${number}`}));
        }
        expect(clearTimeout).toHaveBeenCalledTimes(1);

        unmount();
        expect(clearTimeout).toHaveBeenCalledTimes(5);
    });

    it('expires success and error messages at their configured durations', () => {
        vi.useFakeTimers();
        renderProducer();

        fireEvent.click(screen.getByRole('button', {name: 'success'}));
        fireEvent.click(screen.getByRole('button', {name: 'error'}));

        act(() => vi.advanceTimersByTime(1_999));
        expect(screen.queryByText('Saved')).not.toBeNull();
        expect(screen.queryByText('Too many downloads. Try again later.')).not.toBeNull();

        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByText('Saved')).toBeNull();
        expect(screen.queryByText('Too many downloads. Try again later.')).not.toBeNull();

        act(() => vi.advanceTimersByTime(3_000));
        expect(screen.queryByText('Too many downloads. Try again later.')).toBeNull();
    });

    it('keeps long messages at the top, centered, and bounded within the viewport', () => {
        renderProducer();
        fireEvent.click(screen.getByRole('button', {name: 'error'}));

        const toast = screen.getByRole('alert');
        const viewport = toast.parentElement;
        const icon = toast.querySelector('svg');
        const message = toast.querySelector('span');

        expect(viewport?.className).toContain('top-4');
        expect(viewport?.className).not.toContain('bottom-24');
        expect(viewport?.className).toContain('left-1/2');
        expect(viewport?.className).toContain('-translate-x-1/2');
        expect(viewport?.className).toContain('items-center');
        expect(toast.className).toContain('max-w-[calc(100vw-2rem)]');
        expect(message?.className).toContain('break-words');
        expect(message?.className).toContain('min-w-0');
        expect(icon?.getAttribute('class')).toContain('shrink-0');
    });
});
