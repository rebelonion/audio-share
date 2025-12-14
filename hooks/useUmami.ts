'use client';

declare global {
    interface Window {
        umami?: {
            track: (eventName?: string, eventData?: Record<string, unknown>) => void;
        };
    }
}

export const useUmami = () => {
    const track = (eventName?: string, eventData?: Record<string, unknown>) => {
        if (typeof window !== 'undefined' && window.umami) {
            if (eventName) {
                window.umami.track(eventName, eventData);
            } else {
                window.umami.track();
            }
        }
    };

    return { track };
};