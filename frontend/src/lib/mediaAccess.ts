import {API_BASE} from '@/lib/api';

export type MediaAccessPurpose = 'stream' | 'download';

export interface MediaAccessGrant {
    accessKey: string;
    expiresAt: number;
}

interface MediaAccessErrorBody {
    error?: string;
    retryAfter?: number;
}

export class MediaAccessError extends Error {
    readonly status: number;
    readonly code: string;
    readonly retryAfter: number | null;

    constructor(status: number, code: string, retryAfter: number | null) {
        super(code);
        this.name = 'MediaAccessError';
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }
}

interface SessionBootstrap {
    generation: number;
    promise: Promise<void>;
}

let sessionBootstrap: SessionBootstrap | null = null;
let nextSessionGeneration = 1;

function startSessionBootstrap(): SessionBootstrap {
    const bootstrap: SessionBootstrap = {
        generation: nextSessionGeneration++,
        promise: fetch(`${API_BASE}/api/session`, {
            method: 'POST',
            credentials: 'include',
        }).then(response => {
            if (!response.ok) {
                throw new MediaAccessError(response.status, 'session_bootstrap_failed', null);
            }
        }).catch(error => {
            if (sessionBootstrap === bootstrap) sessionBootstrap = null;
            throw error;
        }),
    };
    sessionBootstrap = bootstrap;
    return bootstrap;
}

async function ensureMediaSession(): Promise<number> {
    const bootstrap = sessionBootstrap || startSessionBootstrap();
    await bootstrap.promise;
    return bootstrap.generation;
}

async function refreshMediaSession(observedGeneration: number): Promise<void> {
    const bootstrap = sessionBootstrap?.generation === observedGeneration
        ? startSessionBootstrap()
        : sessionBootstrap || startSessionBootstrap();
    await bootstrap.promise;
}

async function issueAccessKey(
    shareKey: string,
    purpose: MediaAccessPurpose,
    signal?: AbortSignal,
): Promise<Response> {
    return fetch(`${API_BASE}/api/audio/key/${encodeURIComponent(shareKey)}/access`, {
        method: 'POST',
        credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({purpose}),
        signal,
    });
}

export async function requestMediaAccess(
    shareKey: string,
    purpose: MediaAccessPurpose,
    signal?: AbortSignal,
): Promise<MediaAccessGrant> {
    const sessionGeneration = await ensureMediaSession();
    let response = await issueAccessKey(shareKey, purpose, signal);
    if (response.status === 401) {
        await refreshMediaSession(sessionGeneration);
        response = await issueAccessKey(shareKey, purpose, signal);
    }

    const body = await response.json().catch(() => ({})) as MediaAccessErrorBody & {
        accessKey?: string;
        expiresAt?: string;
        expiresInMs?: number;
    };
    if (!response.ok) {
        const headerRetry = Number.parseInt(response.headers.get('Retry-After') || '', 10);
        const retryAfter = Number.isFinite(headerRetry)
            ? headerRetry
            : typeof body.retryAfter === 'number' ? body.retryAfter : null;
        throw new MediaAccessError(response.status, body.error || 'media_access_failed', retryAfter);
    }

    if (!body.accessKey) {
        throw new MediaAccessError(response.status, 'invalid_media_access_response', null);
    }
    if (typeof body.expiresInMs === 'number' && Number.isFinite(body.expiresInMs) && body.expiresInMs >= 0) {
        const safetyMargin = Math.min(5_000, Math.floor(body.expiresInMs * 0.05));
        return {
            accessKey: body.accessKey,
            expiresAt: Date.now() + Math.max(0, body.expiresInMs - safetyMargin),
        };
    }
    const serverExpiresAt = Date.parse(body.expiresAt || '');
    if (!Number.isFinite(serverExpiresAt)) {
        throw new MediaAccessError(response.status, 'invalid_media_access_response', null);
    }
    const serverNow = Date.parse(response.headers.get('Date') || '');
    const expiresAt = Number.isFinite(serverNow)
        ? Date.now() + Math.max(0, serverExpiresAt - serverNow)
        : serverExpiresAt;
    return {accessKey: body.accessKey, expiresAt};
}

export function mediaAccessURL(
    shareKey: string,
    purpose: MediaAccessPurpose,
    accessKey: string,
): string {
    const action = purpose === 'download' ? '/download' : '';
    return `${API_BASE}/api/audio/key/${encodeURIComponent(shareKey)}${action}?access_key=${encodeURIComponent(accessKey)}`;
}

export async function startAudioDownload(shareKey: string): Promise<void> {
    const grant = await requestMediaAccess(shareKey, 'download');
    const anchor = document.createElement('a');
    anchor.href = mediaAccessURL(shareKey, 'download', grant.accessKey);
    anchor.download = '';
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

export function mediaAccessErrorMessage(error: unknown, action: 'play' | 'download'): string {
    if (!(error instanceof MediaAccessError)) {
        return action === 'play'
            ? 'Could not authorize playback. Please try again.'
            : 'Could not authorize this download. Please try again.';
    }
    if (error.code === 'session_too_new' && action === 'download') {
        return error.retryAfter && error.retryAfter > 0
            ? `Downloads are available in ${formatWait(error.retryAfter)}.`
            : 'Downloads will be available later.';
    }
    if (error.status === 429) {
        const wait = error.retryAfter && error.retryAfter > 0
            ? ` Try again in ${formatWait(error.retryAfter)}.`
            : ' Please try again later.';
        return `Too many ${action === 'play' ? 'plays' : 'downloads'}.${wait}`;
    }
    if (error.status === 404) {
        return 'This audio is no longer available.';
    }
    return action === 'play'
        ? 'Could not authorize playback. Please try again.'
        : 'Could not authorize this download. Please try again.';
}

function formatWait(seconds: number): string {
    if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.ceil(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
}
