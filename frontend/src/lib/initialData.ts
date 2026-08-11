type InitialResponse = {
    status: number;
    body: unknown;
};

let responses: Map<string, InitialResponse> | null | undefined;
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function canonicalRequestKey(input: RequestInfo | URL): string | null {
    const rawURL = input instanceof Request ? input.url : input.toString();
    try {
        const baseURL = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
        const url = new URL(rawURL, baseURL);
        if (typeof window !== 'undefined' && url.origin !== window.location.origin) return null;
        url.searchParams.sort();
        let pathname = url.pathname;
        try {
            pathname = decodeURIComponent(pathname);
        } catch {
            // Preserve malformed paths so they simply miss the initial response cache.
        }
        const query = url.searchParams.toString();
        return query ? `${pathname}?${query}` : pathname;
    } catch {
        return null;
    }
}

function loadInitialResponses(): Map<string, InitialResponse> | null {
    if (responses !== undefined) return responses;
    responses = null;
    if (typeof document === 'undefined') return responses;

    const element = document.getElementById('server-initial-data');
    if (!element?.textContent) return responses;
    try {
        const parsed = JSON.parse(element.textContent) as Record<string, InitialResponse>;
        responses = new Map(
            Object.entries(parsed).flatMap(([path, response]) => {
                const key = canonicalRequestKey(path);
                return key ? [[key, response] as const] : [];
            }),
        );
    } catch {
        responses = null;
    } finally {
        element.remove();
    }
    return responses;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) return init.method.toUpperCase();
    return input instanceof Request ? input.method.toUpperCase() : 'GET';
}

export function takeInitialResponse(input: RequestInfo | URL, init?: RequestInit): Response | null {
    if (requestMethod(input, init) !== 'GET') return null;
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) return null;

    const key = canonicalRequestKey(input);
    const cache = loadInitialResponses();
    if (!key || !cache) return null;
    const response = cache.get(key);
    if (!response) return null;

    if (!expiryTimers.has(key)) {
        expiryTimers.set(key, setTimeout(() => {
            cache.delete(key);
            expiryTimers.delete(key);
        }, 0));
    }

    return new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: {'Content-Type': 'application/json'},
    });
}

export function resetInitialResponsesForTests(): void {
    for (const timer of expiryTimers.values()) clearTimeout(timer);
    expiryTimers.clear();
    responses = undefined;
}
