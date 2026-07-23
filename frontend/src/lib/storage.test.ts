import {afterEach, describe, expect, it, vi} from 'vitest';
import {readLocalStorage, removeLocalStorage, writeLocalStorage} from './storage';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('safe local storage access', () => {
    it('reads, writes, and removes values when storage is available', () => {
        const values = new Map<string, string>();
        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
                removeItem: (key: string) => values.delete(key),
            },
        });

        expect(writeLocalStorage('queue', 'value')).toBe(true);
        expect(readLocalStorage('queue')).toBe('value');
        expect(removeLocalStorage('queue')).toBe(true);
        expect(readLocalStorage('queue')).toBeNull();
    });

    it('falls back without throwing when storage access is denied', () => {
        const deniedWindow = {};
        Object.defineProperty(deniedWindow, 'localStorage', {
            get: () => {
                throw new DOMException('Storage denied', 'SecurityError');
            },
        });
        vi.stubGlobal('window', deniedWindow);

        expect(readLocalStorage('queue')).toBeNull();
        expect(writeLocalStorage('queue', 'value')).toBe(false);
        expect(removeLocalStorage('queue')).toBe(false);
    });

    it('falls back when a storage operation exceeds quota', () => {
        vi.stubGlobal('window', {
            localStorage: {
                getItem: () => null,
                setItem: () => {
                    throw new DOMException('Storage full', 'QuotaExceededError');
                },
                removeItem: () => undefined,
            },
        });

        expect(writeLocalStorage('queue', 'value')).toBe(false);
    });
});
