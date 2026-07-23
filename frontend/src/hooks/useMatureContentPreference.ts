import { useCallback, useEffect, useState } from 'react';
import { getMatureContentPreference, setMatureContentPreference } from '@/lib/api';
import {
    MATURE_PREFERENCE_EVENT,
    resetMatureContentClientState,
} from '@/lib/matureContentPreference';

export function useMatureContentPreference() {
    const [enabled, setEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        getMatureContentPreference()
            .then((value) => {
                if (!cancelled) setEnabled(value);
            })
            .catch(() => {
                if (!cancelled) setEnabled(false);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const listener = (event: Event) => {
            const customEvent = event as CustomEvent<boolean>;
            setEnabled(!!customEvent.detail);
        };
        window.addEventListener(MATURE_PREFERENCE_EVENT, listener);
        return () => window.removeEventListener(MATURE_PREFERENCE_EVENT, listener);
    }, []);

    const update = useCallback(async (value: boolean) => {
        setEnabled(value);
        try {
            const saved = await setMatureContentPreference(value);
            setEnabled(saved);
            if (!saved) {
                resetMatureContentClientState();
            } else {
                window.dispatchEvent(new CustomEvent<boolean>(MATURE_PREFERENCE_EVENT, {detail: true}));
            }
        } catch {
            setEnabled((current) => !current);
        }
    }, []);

    return { enabled, isLoading, setEnabled: update };
}
