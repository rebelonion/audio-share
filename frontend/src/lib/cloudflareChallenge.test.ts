/** @vitest-environment jsdom */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
    appFetch,
    CLOUDFLARE_CHALLENGE_EVENT,
    CloudflareChallengeError,
    isCloudflareChallengeResponse,
} from './cloudflareChallenge';
import {resetInitialResponsesForTests} from './initialData';

afterEach(() => {
    resetInitialResponsesForTests();
    document.getElementById('server-initial-data')?.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Cloudflare challenge detection', () => {
    it('serves embedded initial data without a network request', async () => {
        const initialData = document.createElement('script');
        initialData.id = 'server-initial-data';
        initialData.type = 'application/json';
        initialData.textContent = JSON.stringify({
            '/api/search?limit=50&q=matching': {
                status: 200,
                body: {results: [{name: 'Initial result'}], total: 1},
            },
        });
        document.head.append(initialData);
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const response = await appFetch('/api/search?q=matching&limit=50');

        expect(response.ok).toBe(true);
        expect(await response.json()).toEqual({results: [{name: 'Initial result'}], total: 1});
        expect(fetchMock).not.toHaveBeenCalled();
        expect(document.getElementById('server-initial-data')).toBeNull();
    });

    it('does not use embedded GET data for mutations', async () => {
        const initialData = document.createElement('script');
        initialData.id = 'server-initial-data';
        initialData.type = 'application/json';
        initialData.textContent = JSON.stringify({
            '/api/example': {status: 200, body: {source: 'initial'}},
        });
        document.head.append(initialData);
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"source":"network"}'));
        vi.stubGlobal('fetch', fetchMock);

        const response = await appFetch('/api/example', {method: 'POST'});

        expect(await response.json()).toEqual({source: 'network'});
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('does not use same-path embedded data for cross-origin requests', async () => {
        const initialData = document.createElement('script');
        initialData.id = 'server-initial-data';
        initialData.type = 'application/json';
        initialData.textContent = JSON.stringify({
            '/api/example': {status: 200, body: {source: 'initial'}},
        });
        document.head.append(initialData);
        const fetchMock = vi.fn().mockResolvedValue(new Response('{"source":"network"}'));
        vi.stubGlobal('fetch', fetchMock);

        const response = await appFetch('https://api.example.test/api/example');

        expect(await response.json()).toEqual({source: 'network'});
        expect(fetchMock).toHaveBeenCalledOnce();
    });

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
