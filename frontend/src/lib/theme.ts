import {writeLocalStorage} from '@/lib/storage';
import {initialTheme, LIGHT_QUERY, THEME_STORAGE_KEY, type Theme} from '@/lib/themeBoot';

export {THEME_STORAGE_KEY, type Theme};

// Holds the choice for this page load when saving fails (blocked or full storage); it wins over
// any older stored value so the toggle can't snap back. A storage change from another tab replaces it.
let unsavedChoice: Theme | null = null;
// Cached so useSyncExternalStore's per-render snapshot reads skip localStorage and matchMedia.
let current: Theme | null = null;
const listeners = new Set<() => void>();

export function resolveTheme(): Theme {
    return current ??= unsavedChoice ?? initialTheme();
}

/** Re-reads the theme, applies it to the page, and notifies every subscriber. */
function update(): void {
    current = null;
    document.documentElement.dataset.theme = resolveTheme();
    listeners.forEach(listener => listener());
}

/** Saves an explicit choice, applies it, and updates every subscriber in this tab. */
export function setTheme(theme: Theme): void {
    unsavedChoice = writeLocalStorage(THEME_STORAGE_KEY, theme) ? null : theme;
    update();
}

/**
 * Keeps data-theme current for the whole page, whether or not a toggle is mounted: follows the OS
 * until the visitor chooses, and picks up choices made in other tabs. Call once at startup.
 */
export function startThemeSync(): () => void {
    const onStorage = (event: StorageEvent) => {
        // key is null when another tab calls localStorage.clear().
        if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
        unsavedChoice = null;
        update();
    };
    const query = window.matchMedia?.(LIGHT_QUERY);
    window.addEventListener('storage', onStorage);
    // This runs before the first render, so it must not throw: Safari 13 and older only have addListener.
    if (query?.addEventListener) query.addEventListener('change', update);
    else query?.addListener?.(update);
    update();
    return () => {
        window.removeEventListener('storage', onStorage);
        if (query?.removeEventListener) query.removeEventListener('change', update);
        else query?.removeListener?.(update);
    };
}

/** useSyncExternalStore subscription; the store applies data-theme itself. */
export function subscribeTheme(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
