import {useEffect, useRef, useState} from 'react';

export function useImmersiveFullscreen() {
    const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ownsFullscreen = useRef(false);
    const mounted = useRef(false);
    const supported = !!document.fullscreenEnabled;

    useEffect(() => {
        mounted.current = true;
        const sync = () => {
            setFullscreen(!!document.fullscreenElement);
            if (!document.fullscreenElement) ownsFullscreen.current = false;
        };
        document.addEventListener('fullscreenchange', sync);
        return () => {
            mounted.current = false;
            document.removeEventListener('fullscreenchange', sync);
            if (ownsFullscreen.current && document.fullscreenElement === document.documentElement) {
                void document.exitFullscreen().catch(() => {});
            }
        };
    }, []);

    const toggleFullscreen = async () => {
        setPending(true);
        setError(null);
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                // Keep playback confirmation dialogs portaled to the body visible, too.
                await document.documentElement.requestFullscreen();
                ownsFullscreen.current = true;
                if (!mounted.current) await document.exitFullscreen();
            }
        } catch {
            if (mounted.current) setError('Fullscreen could not be changed. Please try again.');
        } finally {
            if (mounted.current) setPending(false);
        }
    };

    return {fullscreen, supported, pending, error, toggleFullscreen};
}
