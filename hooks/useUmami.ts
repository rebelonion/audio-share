'use client';

import { useCallback } from 'react';

declare global {
    interface Window {
        umami?: {
            track: (eventName?: string, eventData?: Record<string, unknown>) => void;
        };
    }
}

export const useUmami = () => {
    const track = useCallback((eventName: string, eventData?: Record<string, unknown>) => {
        if (typeof window !== 'undefined' && window.umami) {
            window.umami.track(eventName, eventData);
        }
    }, []);

    return { track };
};