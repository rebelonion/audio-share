import { useCallback, useEffect, useState } from 'react';
import { getMatureContentPreference, setMatureContentPreference } from '@/lib/api';

const maturePreferenceEvent = 'audio-share:mature-preference';

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
        window.addEventListener(maturePreferenceEvent, listener);
        return () => window.removeEventListener(maturePreferenceEvent, listener);
    }, []);

    const update = useCallback(async (value: boolean) => {
        setEnabled(value);
        try {
            const saved = await setMatureContentPreference(value);
            setEnabled(saved);
            window.dispatchEvent(new CustomEvent(maturePreferenceEvent, { detail: saved }));
            if (!saved) {
                sessionStorage.removeItem('mature-warning-ack');
                sessionStorage.removeItem('mature-download-warning-ack');
            }
        } catch {
            setEnabled((current) => !current);
        }
    }, []);

    return { enabled, isLoading, setEnabled: update };
}
