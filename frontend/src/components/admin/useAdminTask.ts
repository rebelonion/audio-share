import {useCallback, useEffect, useRef, useState} from 'react';
import {AdminAccessError} from '@/lib/operations';

export type AuthFailure = (message: string) => void;

export function useAdminTask(onAuthFailure: AuthFailure) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const active = useRef<AbortController | null>(null);
    useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
    const run = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
        if (active.current) return;
        const controller = new AbortController();
        active.current = controller;
        setBusy(true); setError(''); setNotice('');
        try { await action(controller.signal); }
        catch (cause) {
            if (controller.signal.aborted) return;
            const message = cause instanceof Error ? cause.message : 'The request failed. Try again.';
            if (cause instanceof AdminAccessError) onAuthFailure(message);
            else setError(message);
        } finally {
            if (active.current === controller) { active.current = null; setBusy(false); }
        }
    }, [onAuthFailure]);
    return {busy, error, notice, setNotice, run};
}

export function useAdminList<T>(load: (signal: AbortSignal) => Promise<T[]>, onAuthFailure: AuthFailure) {
    const [items, setItems] = useState<T[]>([]);
    const [loaded, setLoaded] = useState(false);
    const task = useAdminTask(onAuthFailure);
    const {run} = task;
    const reload = useCallback(() => run(async signal => {
        const values = await load(signal);
        if (!signal.aborted) { setItems(values); setLoaded(true); }
    }), [load, run]);
    useEffect(() => { void reload(); }, [reload]);
    return {...task, items, setItems, loaded, reload};
}

