/** @vitest-environment jsdom */

import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {resolveTheme, setTheme, startThemeSync, THEME_STORAGE_KEY} from './theme';
import {initialTheme, prePaintThemeScript} from './themeBoot';

let prefersLight = false;
let systemListener: (() => void) | null = null;
let stopSync = () => {};

beforeEach(() => {
    prefersLight = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
        get matches() { return query === '(prefers-color-scheme: light)' && prefersLight; },
        addEventListener: (_: string, listener: () => void) => { systemListener = listener; },
        removeEventListener: () => { systemListener = null; },
    }));
    stopSync = startThemeSync();
});

afterEach(() => {
    stopSync();
    vi.restoreAllMocks();
    setTheme('dark'); // a successful save clears any unsaved in-memory choice
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
});

it.each([
    {stored: null, light: false, expected: 'dark'},
    {stored: null, light: true, expected: 'light'},
    {stored: 'light', light: false, expected: 'light'},
    {stored: 'dark', light: true, expected: 'dark'},
    {stored: 'sepia', light: true, expected: 'light'},
])('the pre-paint script and the app agree (stored $stored, OS light $light)', ({stored, light, expected}) => {
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
    prefersLight = light;
    delete document.documentElement.dataset.theme;

    new Function(prePaintThemeScript())();

    expect(document.documentElement.dataset.theme).toBe(expected);
    expect(initialTheme()).toBe(expected);
});

it('the pre-paint script still falls back to the OS when storage is blocked', () => {
    prefersLight = true;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError');
    });

    new Function(prePaintThemeScript())();

    expect(document.documentElement.dataset.theme).toBe('light');
});

it('keeps a choice that could not be saved over an older stored one', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    setTheme('light');

    expect(resolveTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
});

it('follows the OS with no toggle mounted', () => {
    prefersLight = true;
    systemListener?.();
    expect(document.documentElement.dataset.theme).toBe('light');
});

it('falls back to the OS when another tab clears storage', () => {
    setTheme('light');
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', {key: null}));

    expect(document.documentElement.dataset.theme).toBe('dark');
});

it('adopts another tab\'s save even after a failed save here', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    setTheme('light');
    setItem.mockRestore();

    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.dispatchEvent(new StorageEvent('storage', {key: THEME_STORAGE_KEY, newValue: 'dark'}));

    expect(document.documentElement.dataset.theme).toBe('dark');
});

it('starts on browsers whose media queries only support addListener (Safari 13)', () => {
    stopSync();
    let legacyListener: (() => void) | null = null;
    vi.stubGlobal('matchMedia', () => ({
        get matches() { return prefersLight; },
        addListener: (listener: () => void) => { legacyListener = listener; },
        removeListener: () => { legacyListener = null; },
    }));

    expect(() => { stopSync = startThemeSync(); }).not.toThrow();
    prefersLight = true;
    legacyListener!();
    expect(document.documentElement.dataset.theme).toBe('light');
});
