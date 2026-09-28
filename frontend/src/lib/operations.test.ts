/** @vitest-environment jsdom */
import {afterEach, expect, it, vi} from 'vitest';
import {AdminAccessError, getLibraryHealth, getAdminSession, loginAdmin, logoutAdmin} from './operations';
afterEach(() => vi.unstubAllGlobals());
it('sends the key only at login and uses cookies for subsequent requests', async () => {
    const fetcher = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await loginAdmin('private-key');
    expect(fetcher).toHaveBeenLastCalledWith('/api/admin/session', {method: 'POST', credentials: 'include', headers: {'X-API-Key': 'private-key'}, cache: 'no-store'});
    await getLibraryHealth(controller.signal);
    expect(fetcher).toHaveBeenLastCalledWith('/api/admin/health', {credentials: 'include', cache: 'no-store', signal: controller.signal});
    await logoutAdmin();
    expect(fetcher).toHaveBeenLastCalledWith('/api/admin/session', {method: 'DELETE', credentials: 'include', cache: 'no-store'});
});
it('treats an absent session as signed out and expired health requests as auth failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: 401})));
    await expect(getAdminSession(new AbortController().signal)).resolves.toBeNull();
    await expect(getLibraryHealth(new AbortController().signal)).rejects.toBeInstanceOf(AdminAccessError);
    await expect(loginAdmin('bad')).rejects.toBeInstanceOf(AdminAccessError);
});
it('does not claim logout succeeded on server failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: 500})));
    await expect(logoutAdmin()).rejects.toThrow('Could not clear');
});
