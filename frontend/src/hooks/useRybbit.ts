import { useCallback } from 'react';

export const useRybbit = () => {
    const track = useCallback((eventName: string, eventData?: Record<string, unknown>) => {
        if (!window.rybbit) return;
        window.rybbit.event(eventName, eventData);
    }, []);

    return { track };
};
