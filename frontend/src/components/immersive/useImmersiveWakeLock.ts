import {useEffect} from 'react';

export function useImmersiveWakeLock(enabled: boolean) {
    useEffect(() => {
        if (!enabled || !navigator.wakeLock) return;
        let cancelRequest: (() => void) | null = null;

        const sync = () => {
            if (document.visibilityState !== 'visible') {
                cancelRequest?.();
                cancelRequest = null;
                return;
            }
            if (cancelRequest) return;

            let cancelled = false;
            let lock: WakeLockSentinel | null = null;
            const onRelease = () => {
                lock = null;
                if (!cancelled) cancelRequest = null;
            };
            cancelRequest = () => {
                cancelled = true;
                if (lock) {
                    lock.removeEventListener('release', onRelease);
                    void lock.release().catch(() => {});
                    lock = null;
                }
            };

            void navigator.wakeLock.request('screen').then(acquired => {
                if (cancelled) {
                    void acquired.release().catch(() => {});
                    return;
                }
                if (acquired.released) {
                    cancelRequest = null;
                    return;
                }
                lock = acquired;
                lock.addEventListener('release', onRelease, {once: true});
            }).catch(() => {
                // Device power settings or browser policy can deny a wake lock.
                if (!cancelled) cancelRequest = null;
            });
        };

        sync();
        document.addEventListener('visibilitychange', sync);
        return () => {
            document.removeEventListener('visibilitychange', sync);
            cancelRequest?.();
        };
    }, [enabled]);
}
