import {useCallback, useEffect, useRef, useState} from 'react';
import {
    queueForPersistence,
    restoreQueue,
    type QueueState,
} from '@/lib/playerQueue';
import {readLocalStorage, writeLocalStorage} from '@/lib/storage';

export const QUEUE_STORAGE_KEY = 'audio-share:queue:v1';

export function usePersistentPlayerQueue() {
    const [queue, setQueue] = useState<QueueState>(() => restoreQueue(readLocalStorage(QUEUE_STORAGE_KEY)));
    const queueRef = useRef(queue);

    const updateQueue = useCallback((next: QueueState) => {
        queueRef.current = next;
        setQueue(next);
    }, []);

    useEffect(() => {
        const persist = () => {
            writeLocalStorage(QUEUE_STORAGE_KEY, JSON.stringify(queueForPersistence(queue)));
        };
        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(persist, {timeout: 2000});
            return () => window.cancelIdleCallback(idleId);
        }
        const timeoutId = window.setTimeout(persist, 250);
        return () => window.clearTimeout(timeoutId);
    }, [queue]);

    return {queue, queueRef, updateQueue};
}
