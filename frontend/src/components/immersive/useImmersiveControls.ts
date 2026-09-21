import {useCallback, useEffect, useRef, useState} from 'react';

export function useImmersiveControls(onEscape: () => void) {
    const rootRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const onEscapeRef = useRef(onEscape);
    onEscapeRef.current = onEscape;
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const revealControls = useCallback(() => {
        setControlsVisible(true);
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => {
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && rootRef.current?.contains(focused) && focused.matches(':focus-visible')) return;
            setControlsVisible(false);
        }, 4500);
    }, []);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus({preventScroll: true});
        const onKeyDown = (event: KeyboardEvent) => {
            const root = rootRef.current;
            if (!root || event.defaultPrevented) return;
            // Existing playback confirmations can appear above this scene.
            const otherDialog = Array.from(document.querySelectorAll<HTMLElement>(':is([role="dialog"], [role="alertdialog"])[aria-modal="true"], dialog:modal'))
                .find(dialog => dialog !== root && !root.contains(dialog) && dialog.getClientRects().length > 0);
            if (otherDialog) {
                if (!otherDialog.contains(document.activeElement)) {
                    event.preventDefault();
                    otherDialog.querySelector<HTMLElement>('button, input, [tabindex="0"]')?.focus();
                }
                return;
            }
            revealControls();
            if (event.key === 'Escape') {
                event.preventDefault();
                onEscapeRef.current();
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(root.querySelectorAll<HTMLElement>(':is(button, input, select):not(:disabled)'))
                .filter(control => control.getClientRects().length > 0);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
                event.preventDefault();
                first?.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
            if (idleTimer.current) clearTimeout(idleTimer.current);
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({preventScroll: true});
        };
    }, [revealControls]);

    useEffect(() => {
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setMotion(!preference.matches);
        preference.addEventListener('change', update);
        return () => preference.removeEventListener('change', update);
    }, []);

    return {rootRef, closeRef, controlsVisible, revealControls, motion, setMotion};
}
