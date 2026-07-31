import {useEffect, useRef, useState} from 'react';
import {CLOUDFLARE_CHALLENGE_EVENT} from '@/lib/cloudflareChallenge';

export default function CloudflareChallengeRecovery() {
    const [challenged, setChallenged] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const reloadButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleChallenge = () => setChallenged(true);
        window.addEventListener(CLOUDFLARE_CHALLENGE_EVENT, handleChallenge);
        return () => window.removeEventListener(CLOUDFLARE_CHALLENGE_EVENT, handleChallenge);
    }, []);

    useEffect(() => {
        if (!challenged) return;

        const dialog = dialogRef.current;
        if (!dialog) return;

        const preventDismissal = (event: Event) => event.preventDefault();
        dialog.addEventListener('cancel', preventDismissal);
        dialog.showModal();
        reloadButtonRef.current?.focus();

        return () => {
            dialog.removeEventListener('cancel', preventDismissal);
            if (dialog.open) dialog.close();
        };
    }, [challenged]);

    if (!challenged) return null;

    const isContactPage = window.location.pathname === '/contact';

    return (
        <dialog
            ref={dialogRef}
            className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl backdrop:bg-black/70"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="security-check-title"
        >
            <h2
                id="security-check-title"
                className="text-xl font-semibold text-[var(--foreground)]"
            >
                Security check expired
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
                Reload to complete Cloudflare&apos;s security check and reconnect.
                Playback can continue from its saved position.
                {isContactPage && (
                    <> Your message draft is saved, but you&apos;ll need to reattach any image.</>
                )}
            </p>
            <button
                ref={reloadButtonRef}
                type="button"
                className="mt-5 w-full rounded-lg bg-[var(--primary)] px-4 py-3 font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
                onClick={() => window.location.reload()}
            >
                Reload and verify
            </button>
        </dialog>
    );
}
