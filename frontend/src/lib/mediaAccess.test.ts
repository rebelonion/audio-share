import {afterEach, describe, expect, it, vi} from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('requestMediaAccess', () => {
    it('bootstraps a session and requests a scoped key', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {status: 204}))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                accessKey: 'signed-key',
                expiresAt: '2026-07-26T18:30:00Z',
            }), {
                status: 200,
                headers: {'Content-Type': 'application/json'},
            }));
        vi.stubGlobal('fetch', fetchMock);
        const {requestMediaAccess} = await import('./mediaAccess');

        const grant = await requestMediaAccess('track-key', 'stream');

        expect(grant).toEqual({
            accessKey: 'signed-key',
            expiresAt: Date.parse('2026-07-26T18:30:00Z'),
        });
        expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/session', {
            method: 'POST',
            credentials: 'include',
        });
        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/audio/key/track-key/access', expect.objectContaining({
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({purpose: 'stream'}),
        }));
    });

    it('replaces an invalid session and retries issuance once', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {status: 204}))
            .mockResolvedValueOnce(new Response(JSON.stringify({error: 'invalid_session'}), {status: 401}))
            .mockResolvedValueOnce(new Response(null, {status: 204}))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                accessKey: 'replacement-key',
                expiresAt: '2026-07-26T18:30:00Z',
            }), {status: 200}));
        vi.stubGlobal('fetch', fetchMock);
        const {requestMediaAccess} = await import('./mediaAccess');

        const grant = await requestMediaAccess('track-key', 'download');

        expect(grant.accessKey).toBe('replacement-key');
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('shares one replacement bootstrap across concurrent 401 responses', async () => {
        let sessionRequests = 0;
        let accessRequests = 0;
        const fetchMock = vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.endsWith('/api/session')) {
                sessionRequests++;
                return new Response(null, {status: 204});
            }

            accessRequests++;
            if (accessRequests <= 2) {
                return new Response(JSON.stringify({error: 'invalid_session'}), {status: 401});
            }
            return new Response(JSON.stringify({
                accessKey: `replacement-key-${accessRequests}`,
                expiresAt: '2026-07-26T18:30:00Z',
            }), {status: 200});
        });
        vi.stubGlobal('fetch', fetchMock);
        const {requestMediaAccess} = await import('./mediaAccess');

        const grants = await Promise.all([
            requestMediaAccess('track-one', 'stream'),
            requestMediaAccess('track-two', 'download'),
        ]);

        expect(grants.map(grant => grant.accessKey)).toEqual([
            'replacement-key-3',
            'replacement-key-4',
        ]);
        expect(sessionRequests).toBe(2);
        expect(accessRequests).toBe(4);
    });

    it('exposes rate-limit retry information', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {status: 204}))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: 'key_limit_exceeded',
                retryAfter: 45,
            }), {
                status: 429,
                headers: {'Retry-After': '45'},
            }));
        vi.stubGlobal('fetch', fetchMock);
        const {requestMediaAccess} = await import('./mediaAccess');

        await expect(requestMediaAccess('track-key', 'stream')).rejects.toEqual(
            expect.objectContaining({
                status: 429,
                code: 'key_limit_exceeded',
                retryAfter: 45,
            }),
        );
    });

    it('uses the relative lifetime without depending on the client clock or Date header', async () => {
        const now = Date.now();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {status: 204}))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                accessKey: 'signed-key',
                expiresInMs: 600_000,
            }), {status: 200}));
        vi.stubGlobal('fetch', fetchMock);
        const {requestMediaAccess} = await import('./mediaAccess');

        const grant = await requestMediaAccess('track-key', 'stream');

        expect(grant.expiresAt).toBeGreaterThanOrEqual(now + 594_900);
        expect(grant.expiresAt).toBeLessThanOrEqual(Date.now() + 595_000);
    });
});

describe('mediaAccessURL', () => {
    it('uses purpose-specific routes and escapes values', async () => {
        const {mediaAccessURL} = await import('./mediaAccess');
        expect(mediaAccessURL('track/key', 'stream', 'signed key'))
            .toBe('/api/audio/key/track%2Fkey?access_key=signed%20key');
        expect(mediaAccessURL('track/key', 'download', 'signed key'))
            .toBe('/api/audio/key/track%2Fkey/download?access_key=signed%20key');
    });
});

describe('mediaAccessErrorMessage', () => {
    it('describes the wait for a session that is too new to download', async () => {
        const {MediaAccessError, mediaAccessErrorMessage} = await import('./mediaAccess');

        expect(mediaAccessErrorMessage(
            new MediaAccessError(429, 'session_too_new', 120),
            'download',
        )).toBe('Downloads are available in 2 minutes.');
    });
});
