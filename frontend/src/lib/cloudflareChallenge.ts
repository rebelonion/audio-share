import {takeInitialResponse} from '@/lib/initialData';
import {markErrorReported, operationForRequest, reportError} from '@/lib/errorReporting';

export const CLOUDFLARE_CHALLENGE_EVENT = 'audio-share:cloudflare-challenge';

export class CloudflareChallengeError extends Error {
    constructor() {
        super('Cloudflare security clearance expired');
        this.name = 'CloudflareChallengeError';
    }
}

export function isCloudflareChallengeResponse(response: Response): boolean {
    return response.headers.get('cf-mitigated') === 'challenge';
}

export async function appFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const initialResponse = takeInitialResponse(input, init);
    if (initialResponse) return initialResponse;

    const operation = operationForRequest(input);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const outcome = ['recommendations', 'recent', 'popular', 'new-tracks', 'unavailable-tracks',
        'metadata', 'waveform', 'version', 'playback-record'].includes(operation) ? 'degraded' : 'blocked';
    let response: Response;
    try {
        response = await fetch(input, init);
    } catch (error) {
        if (!init?.signal?.aborted && !(input instanceof Request && input.signal.aborted)) {
            reportError({operation, method, outcome, stage: 'request', cause: 'network'}, error);
        }
        throw error;
    }
    if (!isCloudflareChallengeResponse(response)) {
        if (response.status >= 500 && response.headers.get('X-Error-Reporting') !== 'persisted') {
            reportError({operation, method, outcome, stage: 'response', cause: 'unavailable', status: response.status});
        }
        const json = response.json.bind(response);
        response.json = async () => {
            try {
                return await json();
            } catch (error) {
                if (response.ok && !init?.signal?.aborted) {
                    reportError({operation, method, outcome, stage: 'parse', cause: 'invalid-response', status: response.status}, error);
                }
                throw error;
            }
        };
        return response;
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(CLOUDFLARE_CHALLENGE_EVENT));
    }
    const error = new CloudflareChallengeError();
    // A clearance prompt is an expected recovery flow, not an outage.
    markErrorReported(error);
    throw error;
}
