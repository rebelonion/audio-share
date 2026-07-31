/** @vitest-environment jsdom */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
    appFetch,
    CLOUDFLARE_CHALLENGE_EVENT,
    CloudflareChallengeError,
    isCloudflareChallengeResponse,
} from './cloudflareChallenge';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Cloudflare challenge detection', () => {
    it('identifies the documented mitigation header', () => {
        expect(isCloudflareChallengeResponse(new Response('', {
            headers: {'cf-mitigated': 'challenge'},
        }))).toBe(true);
        expect(isCloudflareChallengeResponse(new Response('{}'))).toBe(false);
    });

    it('announces a challenge and rejects before callers parse challenge HTML', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>challenge</html>', {
            headers: {
                'cf-mitigated': 'challenge',
                'Content-Type': 'text/html',
            },
        })));
        const listener = vi.fn();
        window.addEventListener(CLOUDFLARE_CHALLENGE_EVENT, listener);

        await expect(appFetch('/api/example')).rejects.toBeInstanceOf(CloudflareChallengeError);
        expect(listener).toHaveBeenCalledOnce();

        window.removeEventListener(CLOUDFLARE_CHALLENGE_EVENT, listener);
    });
});
