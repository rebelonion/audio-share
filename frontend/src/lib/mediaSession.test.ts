import {describe, expect, it, vi} from 'vitest';
import {registerMediaSessionActions} from './mediaSession';

describe('registerMediaSessionActions', () => {
    it('registers media keys without writing native track metadata', () => {
        const handlers = new Map<string, MediaSessionActionHandler | null>();
        const setActionHandler = vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
            handlers.set(action, handler);
        });
        let metadataWrites = 0;
        const mediaSession = {setActionHandler};
        Object.defineProperty(mediaSession, 'metadata', {
            set: () => { metadataWrites += 1; },
        });
        const callbacks = {
            play: vi.fn(),
            pause: vi.fn(),
            next: vi.fn(),
            previous: vi.fn(),
        };

        const unregister = registerMediaSessionActions(mediaSession, callbacks);

        expect(metadataWrites).toBe(0);
        expect(handlers.get('play')).toBe(callbacks.play);
        expect(handlers.get('nexttrack')).toBe(callbacks.next);

        unregister();
        expect(handlers.get('play')).toBeNull();
        expect(handlers.get('nexttrack')).toBeNull();
    });

    it('continues when the browser rejects an unsupported action', () => {
        const handlers = new Map<string, MediaSessionActionHandler | null>();
        const setActionHandler = vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
            if (action === 'nexttrack') throw new DOMException('Unsupported action', 'NotSupportedError');
            handlers.set(action, handler);
        });
        const callbacks = {
            play: vi.fn(),
            pause: vi.fn(),
            next: vi.fn(),
            previous: vi.fn(),
        };

        const unregister = registerMediaSessionActions({setActionHandler}, callbacks);

        expect(handlers.get('play')).toBe(callbacks.play);
        expect(handlers.has('nexttrack')).toBe(false);
        expect(handlers.get('previoustrack')).toBe(callbacks.previous);
        expect(() => unregister()).not.toThrow();
        expect(handlers.get('play')).toBeNull();
        expect(handlers.has('nexttrack')).toBe(false);
    });
});
