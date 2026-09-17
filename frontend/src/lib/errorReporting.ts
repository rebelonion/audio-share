import {BUILD_ID, ERROR_REPORTING} from '@/lib/config';

export type ErrorOperation = 'captcha' | 'session' | 'media-access' | 'playback' | 'download'
    | 'browse' | 'search' | 'recommendations' | 'recent' | 'popular' | 'new-tracks' | 'unavailable-tracks'
    | 'stats' | 'requests' | 'likes' | 'profile' | 'recovery' | 'preferences' | 'contact' | 'source-request'
    | 'targeted-message' | 'metadata' | 'waveform' | 'artwork' | 'page' | 'version' | 'playback-record' | 'admin';
type ErrorStage = 'request' | 'response' | 'setup' | 'solve' | 'verify' | 'play' | 'read' | 'render' | 'import' | 'parse';
type ErrorCause = 'network' | 'timeout' | 'unavailable' | 'invalid-response' | 'unexpected'
    | 'media-network' | 'media-decode' | 'media-source' | 'cloudflare';

export interface ErrorReport {
    operation: ErrorOperation;
    stage: ErrorStage;
    cause: ErrorCause;
    outcome?: 'blocked' | 'degraded';
    status?: number;
    method?: string;
    code?: string;
}

const reportedErrors = new WeakSet<object>();
const recent = new Map<string, number>();
const queue: Array<{body: string; attempts: number}> = [];
let sending = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function createEventId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function markErrorReported(error: unknown) {
    if (error && typeof error === 'object') reportedErrors.add(error);
}

export function reportError(report: ErrorReport, error?: unknown): void {
    if (!ERROR_REPORTING) return;
    try {
        if (error && typeof error === 'object') {
            if (reportedErrors.has(error) || ('name' in error && error.name === 'AbortError')) return;
            markErrorReported(error);
        }
        const now = Date.now();
        const suppliedCode = report.code || (error instanceof Error ? error.name : 'unknown');
        const code = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError',
            'TimeoutError', 'NotSupportedError', 'missing_endpoint', 'network_error', 'challenge_parse_error',
            'challenge_unsupported', 'solve_failed', 'instr_timeout', 'instr_blocked', 'redeem_failed',
            'invalid_solution', 'invalid_expires', 'wasm_load_failed', 'worker_spawn_failed'].includes(suppliedCode)
            ? suppliedCode : 'unknown';
        const key = [report.operation, report.method || '', report.stage, report.cause, code, report.outcome || 'blocked'].join('/');
        if (now - (recent.get(key) ?? -Infinity) < 10_000 || queue.length >= 20) return;
        if (recent.size >= 100) recent.clear();
        recent.set(key, now);
        const ua = navigator.userAgent;
        const browser = /Firefox\//.test(ua) ? 'firefox' : /Chrome\/|Chromium\/|Edg\//.test(ua)
            ? 'chromium' : /Safari\//.test(ua) ? 'safari' : 'other';
        // Explicit fields keep callers from accidentally sending URLs or secrets.
        queue.push({attempts: 0, body: JSON.stringify({
            eventId: createEventId(), operation: report.operation, stage: report.stage,
            cause: report.cause, outcome: report.outcome || 'blocked', status: report.status || 0,
            method: report.method || '', code,
            buildId: /^[a-zA-Z0-9._-]{1,100}$/.test(BUILD_ID) ? BUILD_ID : 'unknown', browser,
        })});
        if (!retryTimer) void flush();
    } catch {
        // Reporting must never break the operation it observes.
    }
}

async function flush(): Promise<void> {
    if (sending || queue.length === 0) return;
    sending = true;
    const item = queue[0];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    let retry = false;
    try {
        // Raw fetch avoids reporting our own transport failures recursively.
        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/errors`, {
            method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json'},
            body: item.body, signal: controller.signal, keepalive: true,
        });
        retry = response.status === 429 || response.status >= 500;
    } catch {
        retry = true;
    } finally {
        clearTimeout(timeout);
        sending = false;
    }
    if (retry && ++item.attempts < 3) {
        retryTimer = setTimeout(() => { retryTimer = undefined; void flush(); }, 60_000 * item.attempts);
    } else {
        queue.shift();
        void flush();
    }
}

export function operationForRequest(input: RequestInfo | URL): ErrorOperation {
    const raw = input instanceof Request ? input.url : input.toString();
    let path: string;
    try {
        path = new URL(raw, typeof window === 'undefined' ? 'http://localhost' : window.location.origin).pathname.replace(/\/$/, '');
    } catch {
        return 'page';
    }
    if (path.startsWith('/api/audio/key/')) {
        if (path.endsWith('/access')) return 'media-access';
        if (path.endsWith('/download')) return 'download';
        if (path.endsWith('/meta')) return 'metadata';
        if (path.endsWith('/waveform')) return 'waveform';
        if (path.endsWith('/thumbnail')) return 'artwork';
        return 'playback';
    }
    const routes: Array<[string, ErrorOperation]> = [
        ['/api/folder/key/', 'artwork'], ['/api/session/targeted-message', 'targeted-message'],
        ['/api/profile/recover', 'recovery'], ['/api/preferences/', 'preferences'],
        ['/api/playback/record', 'playback-record'], ['/api/playback/recommendations/', 'recommendations'],
        ['/api/playback/recent', 'recent'], ['/api/playback/popular', 'popular'],
        ['/api/playback/new', 'new-tracks'], ['/api/playback/unavailable', 'unavailable-tracks'],
        ['/api/audio/random', 'search'], ['/api/session', 'session'], ['/api/browse', 'browse'],
        ['/api/search', 'search'], ['/api/likes', 'likes'], ['/api/contact', 'contact'],
        ['/api/share', 'source-request'], ['/api/stats', 'stats'], ['/api/requests', 'requests'],
        ['/api/admin/', 'admin'], ['/api/version', 'version'],
    ];
    return routes.find(([prefix]) => path.startsWith(prefix))?.[1] || 'page';
}

export function installErrorReporting(): () => void {
    const onError = (event: ErrorEvent) => {
        if (event.error) reportError({operation: 'page', stage: 'render', cause: 'unexpected'}, event.error);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
        reportError({operation: 'page', stage: 'render', cause: 'unexpected'}, event.reason);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
    };
}
