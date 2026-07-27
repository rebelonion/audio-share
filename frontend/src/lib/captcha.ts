import type Cap from '@cap.js/widget';
import capWasmUrl from '@cap.js/wasm/browser/cap_wasm_bg.wasm?url';
import pakoUrl from 'pako/dist/pako_inflate.min.js?url';
import {CAP_PUBLIC_ENDPOINT} from '@/lib/config';

let capInstance: Cap | null = null;
let solveQueue: Promise<void> = Promise.resolve();

async function getCap(): Promise<Cap> {
    if (!CAP_PUBLIC_ENDPOINT) {
        throw new Error('captcha_not_configured');
    }
    if (capInstance) return capInstance;
    window.CAP_CUSTOM_WASM_URL = capWasmUrl;
    window.CAP_PAKO_URL = pakoUrl;
    const {default: CapWidget} = await import('@cap.js/widget');
    capInstance = new CapWidget({apiEndpoint: CAP_PUBLIC_ENDPOINT});
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

            cap.reset();
            const result = await cap.solve();

            const postSolveAbort = aborted(signal);
            if (postSolveAbort) throw postSolveAbort;
            if (!result.success || !result.token) {
                throw new Error('captcha_solve_failed');
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
