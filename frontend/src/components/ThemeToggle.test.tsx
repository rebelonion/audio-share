/** @vitest-environment jsdom */

import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import ThemeToggle from './ThemeToggle';
import {startThemeSync, THEME_STORAGE_KEY} from '@/lib/theme';

let prefersLight = false;
let systemListener: (() => void) | null = null;
let stopSync = () => {};

beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    prefersLight = false;
    systemListener = null;
    vi.stubGlobal('matchMedia', (query: string) => ({
        get matches() { return query.includes('light') && prefersLight; },
        addEventListener: (_: string, listener: () => void) => { systemListener = listener; },
        removeEventListener: () => { systemListener = null; },
    }));
    stopSync = startThemeSync();
});

afterEach(() => {
    stopSync();
    cleanup();
    vi.unstubAllGlobals();
});

it('follows the OS preference until the visitor chooses', () => {
    render(<ThemeToggle />);
    prefersLight = true;
    act(() => systemListener?.());

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', {name: 'Switch to dark mode'})).toBeTruthy();

    prefersLight = false;
    act(() => systemListener?.());
    expect(document.documentElement.dataset.theme).toBe('dark');
});

it('toggles, persists the choice, and stops following the OS', () => {
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe('dark');

    fireEvent.click(screen.getByRole('button', {name: 'Switch to light mode'}));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    prefersLight = false;
    act(() => systemListener?.());
    expect(document.documentElement.dataset.theme).toBe('light');
});

it('uses a stored choice over the OS preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemeToggle />);
    prefersLight = true;
    act(() => systemListener?.());

    expect(document.documentElement.dataset.theme).toBe('dark');
});

it('picks up a toggle made in another tab', () => {
    render(<ThemeToggle />);

    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    act(() => {
        window.dispatchEvent(new StorageEvent('storage', {key: THEME_STORAGE_KEY, newValue: 'light'}));
    });
    expect(document.documentElement.dataset.theme).toBe('light');
});

it('keeps separate toggles in step', () => {
    render(<><ThemeToggle /><ThemeToggle /></>);

    fireEvent.click(screen.getAllByRole('button', {name: 'Switch to light mode'})[0]);
    expect(screen.getAllByRole('button', {name: 'Switch to dark mode'})).toHaveLength(2);
});
