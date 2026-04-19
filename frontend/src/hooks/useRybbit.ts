import { useCallback } from 'react';
import { getSessionId } from '@/lib/api';

export const useRybbit = () => {
    const track = useCallback((eventName: string, eventData?: Record<string, unknown>) => {
        if (!window.rybbit) return;
        if (!window.rybbit.getUserId()) {
            window.rybbit.identify(getSessionId());
        }
        window.rybbit.event(eventName, eventData);
    }, []);

    return { track };
};
