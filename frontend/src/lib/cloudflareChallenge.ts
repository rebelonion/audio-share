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
    const response = await fetch(input, init);
    if (!isCloudflareChallengeResponse(response)) return response;

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(CLOUDFLARE_CHALLENGE_EVENT));
    }
    throw new CloudflareChallengeError();
}
