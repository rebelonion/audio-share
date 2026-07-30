import type Cap from '@cap.js/widget';
import type {CapErrorEvent} from '@cap.js/widget';
import capWasmUrl from '@cap.js/wasm/browser/cap_wasm_bg.wasm?url';
import pakoUrl from 'pako/dist/pako_inflate.min.js?url';
import {CAP_PUBLIC_ENDPOINT} from '@/lib/config';

let capInstance: Cap | null = null;
let solveQueue: Promise<void> = Promise.resolve();
let lastCapError: CapErrorEvent['detail'] | null = null;

class CaptchaSolveError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'CaptchaSolveError';
        this.code = code;
    }
}

function handleCapError(event: CapErrorEvent) {
    event.stopPropagation();
    lastCapError = event.detail;
    try {
        window.rybbit?.event('captcha-error', {
            code: event.detail.code,
            message: event.detail.message,
        });
    } catch {
        // Analytics must not interfere with verification.
    }
}

function solveFailure(): CaptchaSolveError {
    const detail = lastCapError;
    return new CaptchaSolveError(
        detail?.code || 'solve_failed',
        detail?.message || 'CAPTCHA solve did not return a token',
    );
}

async function getCap(): Promise<Cap> {
    if (!CAP_PUBLIC_ENDPOINT) {
        throw new Error('captcha_not_configured');
    }
    if (capInstance) return capInstance;
    window.CAP_CUSTOM_WASM_URL = capWasmUrl;
    window.CAP_PAKO_URL = pakoUrl;
    const {default: CapWidget} = await import('@cap.js/widget');
    const cap = new CapWidget({apiEndpoint: CAP_PUBLIC_ENDPOINT});
    cap.addEventListener('error', handleCapError);
    capInstance = cap;
    return capInstance;
}

function aborted(signal?: AbortSignal): DOMException | null {
    return signal?.aborted ? new DOMException('Aborted', 'AbortError') : null;
}

function disposeCap(cap: Cap) {
    if (capInstance === cap) capInstance = null;
    cap.widget.remove();
}

export function solveCaptcha(signal?: AbortSignal): Promise<string> {
    const solve = solveQueue.then(async () => {
        const abortError = aborted(signal);
        if (abortError) throw abortError;

        const cap = await getCap();
        let cancelled = false;
        const cancelSolve = () => {
            if (cancelled) return;
            cancelled = true;
            disposeCap(cap);
        };
        signal?.addEventListener('abort', cancelSolve, {once: true});

        try {
            const postSetupAbort = aborted(signal);
            if (postSetupAbort) {
                cancelSolve();
                throw postSetupAbort;
            }

            lastCapError = null;
            cap.reset();
            const result = await cap.solve();

            const postSolveAbort = aborted(signal);
            if (postSolveAbort) throw postSolveAbort;
            if (!result?.success || !result.token) {
                throw solveFailure();
            }
            return result.token;
        } catch (error) {
            const solveAbort = aborted(signal);
            if (solveAbort) throw solveAbort;
            throw error;
        } finally {
            signal?.removeEventListener('abort', cancelSolve);
        }
    });
    solveQueue = solve.then(() => undefined, () => undefined);
    return solve;
}
