import { useCallback } from 'react';

export const useRybbit = () => {
    const track = useCallback((eventName: string, eventData?: Record<string, unknown>) => {
        window.rybbit?.event(eventName, eventData);
    }, []);

    return { track };
};
