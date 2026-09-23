/** @vitest-environment jsdom */

import {StrictMode} from 'react';
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useImmersiveWakeLock} from './useImmersiveWakeLock';

class ScreenLock extends EventTarget {
    released = false;
    release = vi.fn(async () => {
        this.released = true;
        this.dispatchEvent(new Event('release'));
    });
}

const request = vi.fn<() => Promise<ScreenLock>>();
let visibility: DocumentVisibilityState;

beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    Object.defineProperty(navigator, 'wakeLock', {configurable: true, value: {request}});
    request.mockReset();
    request.mockImplementation(async () => new ScreenLock());
});

afterEach(() => {
    cleanup();
    Reflect.deleteProperty(navigator, 'wakeLock');
    vi.restoreAllMocks();
});

async function show(state: DocumentVisibilityState) {
    await act(async () => {
        visibility = state;
        document.dispatchEvent(new Event('visibilitychange'));
    });
}

it('holds a lock only during active playback and releases it on exit', async () => {
    const first = new ScreenLock();
    const second = new ScreenLock();
    request.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const view = renderHook(({enabled}) => useImmersiveWakeLock(enabled), {initialProps: {enabled: false}});
    expect(request).not.toHaveBeenCalled();
    await act(async () => view.rerender({enabled: true}));
    expect(request).toHaveBeenCalledWith('screen');
    await act(async () => view.rerender({enabled: true}));
    expect(request).toHaveBeenCalledTimes(1);
    view.rerender({enabled: false});
    expect(first.release).toHaveBeenCalledOnce();
    await act(async () => view.rerender({enabled: true}));
    view.unmount();
    expect(second.release).toHaveBeenCalledOnce();
    await show('visible');
    expect(request).toHaveBeenCalledTimes(2);
});

it('waits for a visible tab and reacquires after returning', async () => {
    visibility = 'hidden';
    const first = new ScreenLock();
    request.mockResolvedValueOnce(first);
    renderHook(() => useImmersiveWakeLock(true));
    expect(request).not.toHaveBeenCalled();
    await show('visible');
    expect(request).toHaveBeenCalledOnce();
    await show('hidden');
    expect(first.release).toHaveBeenCalledOnce();
    await show('visible');
    expect(request).toHaveBeenCalledTimes(2);
});

it('releases a late grant after exit', async () => {
    let resolve!: (lock: ScreenLock) => void;
    request.mockReturnValueOnce(new Promise(value => { resolve = value; }));
    const view = renderHook(() => useImmersiveWakeLock(true));
    view.unmount();
    const late = new ScreenLock();
    await act(async () => resolve(late));
    expect(late.release).toHaveBeenCalledOnce();
});

it('does not let an old pending request replace the lock after a visibility change', async () => {
    let resolve!: (lock: ScreenLock) => void;
    const current = new ScreenLock();
    request.mockReturnValueOnce(new Promise(value => { resolve = value; })).mockResolvedValueOnce(current);
    const view = renderHook(() => useImmersiveWakeLock(true));
    await show('hidden');
    await show('visible');
    const late = new ScreenLock();
    await act(async () => resolve(late));
    expect(late.release).toHaveBeenCalledOnce();
    expect(current.release).not.toHaveBeenCalled();
    view.unmount();
    expect(current.release).toHaveBeenCalledOnce();
});

it('does not spin on system revocation, and retries on returning to the tab', async () => {
    const lock = new ScreenLock();
    request.mockResolvedValueOnce(lock);
    await act(async () => { renderHook(() => useImmersiveWakeLock(true)); });
    await act(async () => lock.release());
    expect(request).toHaveBeenCalledOnce();
    await show('hidden');
    await show('visible');
    expect(request).toHaveBeenCalledTimes(2);
});

it('handles denial and retries when the tab becomes visible again', async () => {
    request.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await act(async () => { renderHook(() => useImmersiveWakeLock(true)); });
    expect(request).toHaveBeenCalledOnce();
    await show('hidden');
    await show('visible');
    expect(request).toHaveBeenCalledTimes(2);
});

it('does nothing in browsers without wake lock support', () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    renderHook(() => useImmersiveWakeLock(true));
    expect(request).not.toHaveBeenCalled();
});

it('releases the discarded grant in Strict Mode while retaining the active one', async () => {
    const discarded = new ScreenLock();
    const active = new ScreenLock();
    request.mockResolvedValueOnce(discarded).mockResolvedValueOnce(active);
    let view: ReturnType<typeof renderHook>;
    await act(async () => {
        view = renderHook(() => useImmersiveWakeLock(true), {wrapper: StrictMode});
    });
    expect(discarded.release).toHaveBeenCalledOnce();
    expect(active.release).not.toHaveBeenCalled();
    view!.unmount();
    expect(active.release).toHaveBeenCalledOnce();
});
