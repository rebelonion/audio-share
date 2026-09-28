import {useCallback, useEffect, useRef, useState} from 'react';

export type SleepTimer = {mode: 'off'} | {mode: 'track'} | {mode: 'deadline'; endsAt: number; minutes: number};

export function useSleepTimer(onExpire: () => void, onFade?: (gain: number) => void) {
    const [fadeOut, setFadeOut] = useState(false);
    const fadeRef = useRef(onFade);
    fadeRef.current = onFade;
    const [timer, setTimer] = useState<SleepTimer>({mode: 'off'});
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const timerRef = useRef(timer);
    const expireRef = useRef(onExpire);
    expireRef.current = onExpire;

    const setSleepTimer = useCallback((value: 'off' | 'track' | number) => {
        const next: SleepTimer = typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1440
            ? {mode: 'deadline', endsAt: Date.now() + value * 60_000, minutes: value}
            : {mode: value === 'track' ? 'track' : 'off'};
        fadeRef.current?.(1);
        timerRef.current = next;
        setTimer(next);
        setRemainingSeconds(next.mode === 'deadline' ? Math.ceil((next.endsAt - Date.now()) / 1000) : 0);
    }, []);

    const consumeTimer = useCallback((trackEnded = false) => {
        const active = timerRef.current;
        const expired = active.mode === 'deadline' && Date.now() >= active.endsAt;
        if (!expired && !(trackEnded && active.mode === 'track')) return false;
        expireRef.current();
        setSleepTimer('off');
        return true;
    }, [setSleepTimer]);

    useEffect(() => {
        if (timer.mode !== 'deadline') return;
        const tick = () => {
            if (timerRef.current !== timer) return;
            if (!consumeTimer()) {
                const remaining = Math.max(0, (timer.endsAt - Date.now()) / 1000);
                setRemainingSeconds(Math.ceil(remaining));
                fadeRef.current?.(fadeOut ? Math.min(1, remaining / 10) : 1);
            }
        };
        const interval = window.setInterval(tick, 1000);
        window.addEventListener('pageshow', tick);
        document.addEventListener('visibilitychange', tick);
        tick();
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('pageshow', tick);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [timer, consumeTimer, fadeOut]);

    return {sleepTimer: timer, remainingSeconds, setSleepTimer, consumeTimer, fadeOut, setFadeOut};
}
