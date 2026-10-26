// No imports: vite.config.ts loads this file to build the pre-paint script in index.html.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
export const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** The saved choice, else the OS preference. prePaintThemeScript below must make the same decision. */
export function initialTheme(): Theme {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch {
        // Storage blocked; fall through to the OS preference.
    }
    return typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
}

/**
 * Inline script that sets data-theme before first paint, so a light-theme visitor never sees a dark flash.
 * Hand-written ES5 rather than initialTheme.toString(): tooling (coverage instrumentation, minifiers)
 * rewrites function source. theme.test.ts runs it against initialTheme.
 */
export function prePaintThemeScript(): string {
    const key = JSON.stringify(THEME_STORAGE_KEY);
    const query = JSON.stringify(LIGHT_QUERY);
    return `(function(){var t;try{t=localStorage.getItem(${key})}catch(e){}`
        + `if(t!=='light'&&t!=='dark'){t=typeof matchMedia==='function'&&matchMedia(${query}).matches?'light':'dark'}`
        + `document.documentElement.dataset.theme=t})()`;
}
