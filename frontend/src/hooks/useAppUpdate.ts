import {useEffect, useState} from 'react';
import {BUILD_ID} from '@/lib/config';
import {appFetch} from '@/lib/cloudflareChallenge';

const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const VERSION_CHECK_TIMEOUT_MS = 10_000;

interface VersionResponse {
    buildId: string;
}

function isVersionResponse(value: unknown): value is VersionResponse {
    return (
        typeof value === 'object'
        && value !== null
        && 'buildId' in value
        && typeof value.buildId === 'string'
    );
}

export function useAppUpdate() {
    const [updateAvailable, setUpdateAvailable] = useState(false);

    useEffect(() => {
        if (!BUILD_ID) return;

        let controller: AbortController | undefined;
        let checking = false;
        let updateFound = false;

        const checkForUpdate = async () => {
            if (checking || updateFound) return;
            checking = true;
            controller = new AbortController();
            const requestController = controller;
            const timeout = window.setTimeout(() => requestController.abort(), VERSION_CHECK_TIMEOUT_MS);

            try {
                const response = await appFetch('/api/version', {
                    cache: 'no-store',
                    signal: requestController.signal,
                });
                if (!response.ok) return;

                const version: unknown = await response.json();
                if (
                    isVersionResponse(version)
                    && version.buildId
                    && version.buildId !== BUILD_ID
                ) {
                    updateFound = true;
                    setUpdateAvailable(true);
                }
            } catch {
                // Version checks are best-effort and should never disrupt the app.
            } finally {
                window.clearTimeout(timeout);
                checking = false;
            }
        };

        const checkWhenVisible = () => {
            if (document.visibilityState === 'visible') {
                void checkForUpdate();
            }
        };

        void checkForUpdate();
        const interval = window.setInterval(checkWhenVisible, VERSION_CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', checkWhenVisible);
        window.addEventListener('online', checkWhenVisible);

        return () => {
            controller?.abort();
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', checkWhenVisible);
            window.removeEventListener('online', checkWhenVisible);
        };
    }, []);

    return updateAvailable;
}
