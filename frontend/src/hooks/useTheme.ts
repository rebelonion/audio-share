import {useSyncExternalStore} from 'react';
import {resolveTheme, setTheme, subscribeTheme} from '@/lib/theme';

// One shared store, so any number of toggles stay in step; the store applies data-theme itself.
export function useTheme() {
    const theme = useSyncExternalStore(subscribeTheme, resolveTheme, () => 'dark' as const);
    return {theme, setTheme};
}
