/** @vitest-environment jsdom */
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useSleepTimer} from './useSleepTimer';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('expires once on wall clock time, including time while paused', () => {
    const stop = vi.fn();
    const {result} = renderHook(() => useSleepTimer(stop));
    act(() => result.current.setSleepTimer(1));
    act(() => vi.advanceTimersByTime(60_000));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.sleepTimer.mode).toBe('off');
    act(() => vi.advanceTimersByTime(60_000));
    expect(stop).toHaveBeenCalledTimes(1);
});
it('checks overdue timers when a suspended page returns', () => {
    const stop = vi.fn();
    const {result} = renderHook(() => useSleepTimer(stop));
    act(() => result.current.setSleepTimer(15));
    vi.setSystemTime(new Date('2026-01-01T00:20:00Z'));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(stop).toHaveBeenCalledTimes(1);
});
it('consumes an end-of-track timer only at a natural end', () => {
    const stop = vi.fn();
    const {result} = renderHook(() => useSleepTimer(stop));
    act(() => result.current.setSleepTimer('track'));
    act(() => expect(result.current.consumeTimer()).toBe(false));
    act(() => expect(result.current.consumeTimer(true)).toBe(true));
    expect(stop).toHaveBeenCalledTimes(1);
    act(() => expect(result.current.consumeTimer(true)).toBe(false));
});
it('cancels or replaces timers without leaving callbacks behind', () => {
    const stop = vi.fn();
    const {result, unmount} = renderHook(() => useSleepTimer(stop));
    act(() => result.current.setSleepTimer(1));
    act(() => result.current.setSleepTimer(15));
    act(() => vi.advanceTimersByTime(60_000));
    expect(stop).not.toHaveBeenCalled();
    act(() => result.current.setSleepTimer('off'));
    act(() => vi.advanceTimersByTime(1_000_000));
    expect(stop).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
});

it('fades a timed stop without changing the saved volume and resets on cancellation', () => {
    const stop = vi.fn();
    const fade = vi.fn();
    const {result} = renderHook(() => useSleepTimer(stop, fade));
    act(() => { result.current.setSleepTimer(1); result.current.setFadeOut(true); });
    act(() => vi.advanceTimersByTime(55_000));
    expect(fade).toHaveBeenLastCalledWith(0.5);
    act(() => result.current.setSleepTimer('off'));
    expect(fade).toHaveBeenLastCalledWith(1);
    expect(stop).not.toHaveBeenCalled();
});
