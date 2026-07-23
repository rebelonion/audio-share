interface MediaSessionCallbacks {
    play: () => void;
    pause: () => void;
    next: () => void;
    previous: () => void;
}

type ActionOnlyMediaSession = Pick<MediaSession, 'setActionHandler'>;

/**
 * Registers media-key controls without publishing native media metadata.
 *
 * Updating MediaSession.metadata can synchronously stall Chromium's Linux
 * desktop integration, so track information stays in the in-page player.
 */
export function registerMediaSessionActions(
    mediaSession: ActionOnlyMediaSession,
    callbacks: MediaSessionCallbacks,
): () => void {
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
        ['play', callbacks.play],
        ['pause', callbacks.pause],
        ['nexttrack', callbacks.next],
        ['previoustrack', callbacks.previous],
    ];
    const registered: MediaSessionAction[] = [];

    for (const [action, handler] of actions) {
        try {
            mediaSession.setActionHandler(action, handler);
            registered.push(action);
        } catch {
            // Browsers may expose MediaSession while supporting only a subset
            // of its actions. Unsupported controls should not break playback.
        }
    }

    return () => {
        for (const action of registered) {
            try {
                mediaSession.setActionHandler(action, null);
            } catch {
                // Support can change while a page is alive; cleanup remains
                // best-effort for the same reason registration is guarded.
            }
        }
    };
}
