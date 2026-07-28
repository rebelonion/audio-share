/** @vitest-environment jsdom */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
    classifyAdBlockProbe,
    classifyAdDeliveryProbe,
    detectCosmeticFiltering,
    loadNetworkAdProbe,
} from './adBlockProbe';

afterEach(() => {
    document.head.querySelectorAll('[data-ad-block-test]').forEach(element => element.remove());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('classifyAdBlockProbe', () => {
    it('reports an extension redirect as confirmed ad blocking', () => {
        expect(classifyAdBlockProbe(true, true, 'extension_redirect', false)).toBe('blocked');
    });

    it('reports a blocked first-party EasyList bait as confirmed ad blocking', () => {
        expect(classifyAdBlockProbe(true, false, 'blocked', false)).toBe('blocked');
    });

    it('reports cosmetic blocking when the bait is hidden', () => {
        expect(classifyAdBlockProbe(true, true, 'loaded', true)).toBe('blocked');
    });

    it('reports no detected blocking when both checks pass', () => {
        expect(classifyAdBlockProbe(true, true, 'loaded', false)).toBe('not_detected');
    });

    it('reports an unknown result when the control cannot load', () => {
        expect(classifyAdBlockProbe(false, false, 'blocked', false)).toBe('unknown');
    });

    it('does not label browser tracking protection as an ad blocker', () => {
        expect(classifyAdBlockProbe(true, true, 'blocked', false)).toBe('not_detected');
    });
});

describe('classifyAdDeliveryProbe', () => {
    it('reports blocked delivery for any failed ad request', () => {
        expect(classifyAdDeliveryProbe(true, true, 'blocked', false)).toBe('blocked');
    });

    it('reports available delivery when all checks pass', () => {
        expect(classifyAdDeliveryProbe(true, true, 'loaded', false)).toBe('available');
    });
});

describe('loadNetworkAdProbe', () => {
    it('reports a successful request without sending cookies or a referrer', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response());
        vi.stubGlobal('fetch', fetchMock);

        await expect(loadNetworkAdProbe()).resolves.toBe('loaded');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://pagead2.googlesyndication.com/pagead/gen_204',
            expect.objectContaining({
                mode: 'no-cors',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                cache: 'no-store',
                signal: expect.any(AbortSignal),
            }),
        );
    });

    it('reports a request rejected by an ad blocker', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

        await expect(loadNetworkAdProbe()).resolves.toBe('blocked');
    });

    it('reports a request redirected to an extension compatibility resource', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            redirected: true,
            url: 'chrome-extension://extension-id/web_accessible_resources/empty.js',
        }));

        await expect(loadNetworkAdProbe()).resolves.toBe('extension_redirect');
    });
});

describe('detectCosmeticFiltering', () => {
    it('detects a cosmetic rule that hides ad-like elements', async () => {
        const style = document.createElement('style');
        style.dataset.adBlockTest = '';
        style.textContent = '#AdBanner { display: none !important; }';
        document.head.appendChild(style);

        await expect(detectCosmeticFiltering()).resolves.toBe(true);
        expect(document.querySelector('#AdBanner')).toBeNull();
    });
});
