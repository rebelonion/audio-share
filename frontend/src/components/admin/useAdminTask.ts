import {useCallback, useEffect, useRef, useState} from 'react';
import {AdminAccessError} from '@/lib/operations';

export type AuthFailure = (message: string) => void;

// Routes a failed admin request: expired sessions lock the dashboard, other
// failures become a message for the caller to show.
function handleAdminFailure(cause: unknown, onAuthFailure: AuthFailure, setError: (message: string) => void, fallback: string) {
    const message = cause instanceof Error ? cause.message : fallback;
    if (cause instanceof AdminAccessError) onAuthFailure(message);
    else setError(message);
}

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
            if (!controller.signal.aborted) handleAdminFailure(cause, onAuthFailure, setError, 'The request failed. Try again.');
        } finally {
            if (active.current === controller) { active.current = null; setBusy(false); }
        }
    }, [onAuthFailure]);
    return {busy, error, notice, setNotice, run};
}

type ListEdit<T> = (items: T[]) => T[];

export function useAdminList<T>(load: (signal: AbortSignal) => Promise<T[]>, onAuthFailure: AuthFailure) {
    const [items, setRawItems] = useState<T[]>([]);
    const [loaded, setLoaded] = useState(false);
    const task = useAdminTask(onAuthFailure);
    const {run} = task;
    // Edits made while a load is in flight, such as a row added by another
    // task, are replayed onto its result so the older snapshot cannot drop them.
    // The result may already include the change, so edits must be safe to
    // repeat: replace or remove rows by ID instead of blindly prepending.
    const editsDuringLoad = useRef<ListEdit<T>[] | null>(null);
    const setItems = useCallback((edit: ListEdit<T>) => {
        editsDuringLoad.current?.push(edit);
        setRawItems(edit);
    }, []);
    const reload = useCallback(() => run(async signal => {
        const edits: ListEdit<T>[] = [];
        editsDuringLoad.current = edits;
        try {
            const values = await load(signal);
            if (!signal.aborted) { setRawItems(edits.reduce((current, edit) => edit(current), values)); setLoaded(true); }
        } finally {
            if (editsDuringLoad.current === edits) editsDuringLoad.current = null;
        }
    }), [load, run]);
    useEffect(() => { void reload(); }, [reload]);
    return {...task, items, setItems, loaded, reload};
}


// Polls while enabled and the page is visible; hidden tabs skip work and
// refresh on return. A request that outlives the interval is abandoned and
// retried, so one hung request cannot stop later refreshes. Disabling pauses
// polling but keeps the last value; reset clears it, e.g. when locking.
export function useAdminPolling<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs: number, onAuthFailure: AuthFailure, enabled = true) {
    const [value, setValue] = useState<T | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const manual = useRef<() => void>(() => {});
    useEffect(() => {
        // A new loader asks a new question; the previous one's error no longer applies.
        setError('');
        if (!enabled) return;
        let controller: AbortController | null = null;
        let timeout = 0;
        let startedAt = -Infinity;
        const run = (force: boolean) => {
            // Scheduled refreshes skip a request that just started, such as a
            // retry after a timeout or a refresh on becoming visible.
            if (controller || (!force && (document.hidden || Date.now() - startedAt < intervalMs / 2))) return;
            const current = new AbortController();
            controller = current;
            startedAt = Date.now();
            setLoading(true);
            timeout = window.setTimeout(() => {
                current.abort();
                controller = null;
                setError('The server is taking too long to respond. Retrying…');
                run(true);
            }, intervalMs);
            load(current.signal).then(result => {
                if (!current.signal.aborted) { setValue(result); setError(''); }
            }).catch(cause => {
                if (!current.signal.aborted) handleAdminFailure(cause, onAuthFailure, setError, 'The request failed. Retrying shortly.');
            }).finally(() => {
                if (controller !== current) return;
                window.clearTimeout(timeout);
                controller = null;
                setLoading(false);
            });
        };
        const refresh = () => run(false);
        manual.current = () => run(true);
        refresh();
        const interval = window.setInterval(refresh, intervalMs);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(interval);
            window.clearTimeout(timeout);
            document.removeEventListener('visibilitychange', refresh);
            manual.current = () => {};
            controller?.abort();
            setLoading(false);
        };
    }, [load, intervalMs, onAuthFailure, enabled]);
    const refresh = useCallback(() => manual.current(), []);
    const reset = useCallback(() => { setValue(null); setError(''); }, []);
    return {value, error, loading, refresh, reset};
}
