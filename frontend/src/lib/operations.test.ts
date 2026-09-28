/** @vitest-environment jsdom */
import {afterEach, expect, it, vi} from 'vitest';
import {AdminAccessError, getLibraryHealth} from './operations';
afterEach(() => vi.unstubAllGlobals());
it('sends the key only as a header and opts out of caches', async () => {
    const fetcher = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await getLibraryHealth('private-key', controller.signal);
    expect(fetcher).toHaveBeenCalledWith('/api/admin/health', {headers: {'X-API-Key': 'private-key'}, cache: 'no-store', signal: controller.signal});
});
it('distinguishes rejected credentials from server failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: 401})));
    await expect(getLibraryHealth('bad', new AbortController().signal)).rejects.toBeInstanceOf(AdminAccessError);
});
