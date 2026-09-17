/** @vitest-environment jsdom */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/lib/config', () => ({BUILD_ID: 'test-build', ERROR_REPORTING: true}));

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('error reporting', () => {
    it('redacts complete credential values', async () => {
        const {diagnosticText} = await import('./errorReporting');
        const redactionFixtures = [
            {input: "password=\"two secret words\" failed", expected: "password=[redacted] failed"},
            {input: "password='two secret words' failed", expected: "password=[redacted] failed"},
            {input: "password=\"two \\\"secret\\\" words\" failed", expected: "password=[redacted] failed"},
            {input: "password=\"unterminated secret words", expected: "password=[redacted]"},
            {input: "Authorization: Basic dXNlcjpwYXNz\nrequest failed", expected: "Authorization: [redacted]\nrequest failed"},
            {input: "Authorization: Digest username=\"alice\", response=\"private\"", expected: "Authorization: [redacted]"},
            {input: "Proxy-Authorization: Bearer private-token", expected: "Proxy-Authorization: [redacted]"},
            {input: "Cookie: session=private; another=private", expected: "Cookie: [redacted]"},
            {input: "accessKey=private recoveryKey=private capToken=private", expected: "accessKey=[redacted] recoveryKey=[redacted] capToken=[redacted]"},
            {input: "access_key=private recovery-key=private API_KEY=private", expected: "access_key=[redacted] recovery-key=[redacted] API_KEY=[redacted]"},
            {input: "{\"accessKey\":\"two secret words\",\"recoveryKey\":\"private\"}", expected: "{\"accessKey\":[redacted],\"recoveryKey\":[redacted]}"},
            {input: "Basic dXNlcjpwYXNz Bearer private-token", expected: "Basic [redacted] Bearer [redacted]"},
            {input: "refreshToken=private sessionSecret=private clientSecret=private", expected: "refreshToken=[redacted] sessionSecret=[redacted] clientSecret=[redacted]"},
            {input: "open source/poster.jpg: permission denied", expected: "open source/poster.jpg: permission denied"},
        ];
        for (const fixture of redactionFixtures) {
            expect(diagnosticText(fixture.input)).toBe(fixture.expected);
        }
    });
    it('captures bounded browser context without URL credentials or tokens', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, {status: 204}));
        vi.stubGlobal('fetch', fetchMock);
        const {reportError} = await import('./errorReporting');
        const error = new Error('Cannot render player; token=private-token');
        error.stack = 'at https://user:private-password@example.com/assets/app.js?key=private-query#private-fragment:1:2';
        reportError({operation: 'page', stage: 'render', cause: 'unexpected', context: {
            endpoint: '/api/search?q=private-search', durationMs: 123.4, componentStack: 'Player\nPage',
        }}, error);
        await vi.advanceTimersByTimeAsync(0);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.context).toMatchObject({route: '/', endpoint: '/api/search', durationMs: 123, online: true, componentStack: 'Player\nPage'});
        expect(body.context.message).toContain('Cannot render player');
        expect(body.context.stack).toContain('/assets/app.js');
        expect(JSON.stringify(body)).not.toContain('private-');
    });
    it('sends redacted diagnostics, suppresses duplicates and ignores cancellations', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, {status: 204}));
        vi.stubGlobal('fetch', fetchMock);
        const {reportError} = await import('./errorReporting');
        const error = new TypeError('https://secret/recover#key=do-not-send');
        const report = {operation: 'captcha', stage: 'solve', cause: 'unavailable'} as const;
        reportError(report, error);
        reportError(report, error);
        reportError(report, new TypeError('another failure'));
        reportError({...report, operation: 'search'}, new DOMException('cancel', 'AbortError'));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/errors');
        expect(JSON.parse(options.body)).toMatchObject({operation: 'captcha', code: 'TypeError', buildId: 'test-build'});
        expect(options.body).not.toMatch(/secret|do-not-send|another failure/);
    });

    it('retries with the same event ID and stops after three failed attempts', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
        vi.stubGlobal('fetch', fetchMock);
        const {reportError} = await import('./errorReporting');
        reportError({operation: 'captcha', stage: 'solve', cause: 'unavailable'});
        await vi.runAllTimersAsync();
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(new Set(fetchMock.mock.calls.map(([, init]) => init.body)).size).toBe(1);
    });

    it('sends valid UUIDs without randomUUID and preserves them across retries', async () => {
        const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(0))
            .mockImplementationOnce(bytes => bytes.fill(255));
        vi.stubGlobal('crypto', {getRandomValues});
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {status: 503}))
            .mockImplementation(() => Promise.resolve(new Response(null, {status: 204})));
        vi.stubGlobal('fetch', fetchMock);
        const {reportError} = await import('./errorReporting');
        reportError({operation: 'captcha', stage: 'solve', cause: 'unavailable'});
        await vi.runAllTimersAsync();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);

        reportError({operation: 'search', stage: 'request', cause: 'network'});
        await vi.runAllTimersAsync();
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(getRandomValues).toHaveBeenCalledTimes(2);
        const ids = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).eventId);
        for (const id of ids) {
            expect(id).toMatch(/^[a-f0-9-]{36}$/);
            expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        }
        expect(ids[0]).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
        expect(ids[2]).toBe('00000000-0000-4000-8000-000000000000');
    });

    it('reports API network and malformed JSON failures even when callers catch them', async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (url === '/api/errors') return Promise.resolve(new Response(null, {status: 204}));
            if (url.includes('search')) return Promise.reject(new TypeError('network unavailable'));
            return Promise.resolve(new Response('invalid JSON'));
        });
        vi.stubGlobal('fetch', fetchMock);
        const {appFetch} = await import('./cloudflareChallenge');
        await expect(appFetch('/api/search?q=secret')).rejects.toThrow();
        const response = await appFetch('/api/likes');
        await expect(response.json()).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(0);
        const reports = fetchMock.mock.calls.filter(([url]) => url === '/api/errors').map(([, init]) => JSON.parse(init.body));
        expect(reports).toEqual(expect.arrayContaining([
            expect.objectContaining({operation: 'search', stage: 'request', cause: 'network'}),
            expect.objectContaining({operation: 'likes', stage: 'parse', cause: 'invalid-response'}),
        ]));
        expect(JSON.stringify(reports)).not.toContain('secret');
    });

    it('avoids double counting backend 5xx and ignores normal 4xx responses', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const {appFetch} = await import('./cloudflareChallenge');
        for (const status of [401, 403, 404, 409, 422, 429, 500, 503]) {
            fetchMock.mockResolvedValueOnce(new Response('{}', {status, headers: {'X-Error-Reporting': 'persisted'}}));
            expect((await appFetch('/api/likes')).status).toBe(status);
        }
        expect(fetchMock.mock.calls.some(([url]) => url === '/api/errors')).toBe(false);
    });

    it('records a proxy 502 and separates reads from writes', async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
            url === '/api/errors' ? new Response(null, {status: 204}) : new Response('', {status: 502}),
        ));
        vi.stubGlobal('fetch', fetchMock);
        const {appFetch} = await import('./cloudflareChallenge');
        await appFetch('/api/likes');
        await appFetch('/api/likes/private-track', {method: 'PUT'});
        await vi.advanceTimersByTimeAsync(0);
        const reports = fetchMock.mock.calls.filter(([url]) => url === '/api/errors').map(([, init]) => JSON.parse(init.body));
        expect(reports.map(report => report.method)).toEqual(['GET', 'PUT']);
        expect(reports.every(report => report.status === 502 && report.operation === 'likes')).toBe(true);
    });

    it.each([undefined, 'unrecognized'])('retries unconfirmed backend errors through database recovery (header: %s)', async header => {
        const reportingFetch = vi.fn()
            .mockResolvedValueOnce(new Response(null, {status: 503}))
            .mockResolvedValueOnce(new Response(null, {status: 204}));
        const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (url === '/api/errors') return reportingFetch(url, init);
            return Promise.resolve(new Response('{}', {
                status: 503, headers: header ? {'X-Error-Reporting': header} : {},
            }));
        });
        vi.stubGlobal('fetch', fetchMock);
        const {appFetch} = await import('./cloudflareChallenge');
        expect((await appFetch('/api/search')).status).toBe(503);
        await vi.advanceTimersByTimeAsync(0);
        expect(reportingFetch).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(reportingFetch).toHaveBeenCalledTimes(2);
        expect(reportingFetch.mock.calls[1][1].body).toBe(reportingFetch.mock.calls[0][1].body);
        await vi.runAllTimersAsync();
        expect(reportingFetch).toHaveBeenCalledTimes(2);
    });

    it('normalizes media paths without retaining identifiers or tokens', async () => {
        const {operationForRequest} = await import('./errorReporting');
        expect(operationForRequest('/api/audio/key/private-track/download?access_key=secret')).toBe('download');
        expect(operationForRequest('/api/profile/recovery-key')).toBe('recovery');
        expect(operationForRequest('/api/session/targeted-message')).toBe('targeted-message');
    });
});
