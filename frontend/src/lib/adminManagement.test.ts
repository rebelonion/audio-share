import {afterEach, expect, it, vi} from 'vitest';
import {AdminAccessError} from './operations';
import {changeRequestStatus, createAdminRequest, deleteAdminRequest, editAdminRequest, listAdminRequests, listAudioSources, sendTargetedMessage, setAudioRemovalRequested, setAudioUnavailable} from './adminManagement';

afterEach(() => vi.unstubAllGlobals());
it('uses the existing API paths and cookie authentication for all management actions', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    await createAdminRequest({title: 'Title', submittedUrl: 'https://example.test', sourceKey: '', tags: [], status: 'requested'}, signal);
    await editAdminRequest(4, {title: 'New title', tags: []}, signal);
    await changeRequestStatus(4, {status: 'added', folderShareKey: null}, signal);
    await deleteAdminRequest(4, signal);
    await listAudioSources(signal);
    await setAudioUnavailable('key/?', true, signal);
    await setAudioRemovalRequested('key/?', false, signal);
    await sendTargetedMessage({sessionId: 'session', title: '', message: 'Note'}, signal);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/admin/requests', '/api/admin/requests/4', '/api/admin/requests/4/status', '/api/admin/requests/4', '/api/admin/audio/sources', '/api/admin/audio/key%2F%3F/unavailable', '/api/admin/audio/key%2F%3F/removal-request', '/api/admin/targeted-messages']);
    for (const [, options] of fetcher.mock.calls) {
        expect(options?.credentials).toBe('include'); expect(options?.cache).toBe('no-store'); expect(options?.signal).toBe(signal);
        expect(options?.headers ?? {}).not.toHaveProperty('X-API-Key');
    }
});
it('reuses the public request listing and normalizes absent tags', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({requested: [{id: 1, tags: null}], added: [{id: 2, tags: []}]})));
    vi.stubGlobal('fetch', fetcher);
    expect(await listAdminRequests(new AbortController().signal)).toEqual([{id: 2, tags: []}, {id: 1, tags: []}]);
    expect(fetcher).toHaveBeenCalledWith('/api/requests', expect.objectContaining({method: 'GET'}));
});
it('distinguishes expiry, rejected writes, and server failures', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', {status: 401})).mockResolvedValueOnce(new Response(JSON.stringify({error: 'Duplicate request'}), {status: 409})).mockResolvedValueOnce(new Response('unavailable', {status: 500}));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    await expect(deleteAdminRequest(1, signal)).rejects.toBeInstanceOf(AdminAccessError);
    await expect(deleteAdminRequest(1, signal)).rejects.toThrow('Duplicate request');
    await expect(deleteAdminRequest(1, signal)).rejects.toThrow('Check the current state');
});

it('distinguishes authentication cooldowns from other throttled writes', async () => {
    const message = 'Too many failed admin authentication attempts. Try again in 30 seconds.';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({code: 'admin_auth_rate_limited', error: message}), {status: 429})));
    const signal = new AbortController().signal;
    await expect(deleteAdminRequest(1, signal)).rejects.toBeInstanceOf(AdminAccessError);
    await expect(deleteAdminRequest(1, signal)).rejects.toThrow(message);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: 429})));
    await expect(deleteAdminRequest(1, signal)).rejects.not.toBeInstanceOf(AdminAccessError);
});
