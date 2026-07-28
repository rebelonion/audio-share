const PRELOAD_RELOAD_BUILD_KEY = '__audioSharePreloadReloadBuild';

function getHistoryState(): Record<string, unknown> {
    const state: unknown = window.history.state;
    if (typeof state !== 'object' || state === null || Array.isArray(state)) {
        return {};
    }
    return state as Record<string, unknown>;
}

export function markPreloadRecoveryAttempt(buildId: string): boolean {
    const state = getHistoryState();
    if (state[PRELOAD_RELOAD_BUILD_KEY] === buildId) {
        return false;
    }

    try {
        window.history.replaceState({
            ...state,
            [PRELOAD_RELOAD_BUILD_KEY]: buildId,
        }, '');
    } catch {
        return false;
    }

    return true;
}
