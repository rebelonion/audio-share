import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {AudioLines, X} from 'lucide-react';
import {fetchTargetedMessage, type TargetedMessage} from '@/lib/targetedMessage';

export default function TargetedMessageModal() {
    const [message, setMessage] = useState<TargetedMessage | null>(null);
    const acknowledgeButtonRef = useRef<HTMLButtonElement>(null);
    const trackedMessageIDRef = useRef<number | null>(null);

    useEffect(() => {
        let active = true;
        void fetchTargetedMessage()
            .then(result => {
                if (active && result) setMessage(result);
            })
            .catch(error => {
                console.error('Could not check for a targeted message:', error);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!message) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        acknowledgeButtonRef.current?.focus();

        if (trackedMessageIDRef.current !== message.id) {
            trackedMessageIDRef.current = message.id;
            window.rybbit?.onReady(rybbit => {
                rybbit.event('targeted-message-displayed', {messageId: message.id});
            });
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMessage(null);
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus();
        };
    }, [message]);

    if (!message) return null;

    return createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="targeted-message-title"
                aria-describedby="targeted-message-body"
                className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--primary-border)] bg-[var(--card)] shadow-[0_28px_90px_rgba(0,0,0,0.65)] animate-slideUp"
            >
                <div
                    className="h-[3px]"
                    style={{
                        background: 'linear-gradient(90deg, transparent, var(--primary) 22%, var(--primary-hover) 50%, var(--primary) 78%, transparent)',
                    }}
                    aria-hidden="true"
                />
                <div className="p-6 sm:p-7">
                    <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--primary-border)] bg-[var(--primary-tint)] text-[var(--primary)]">
                            <AudioLines className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-[var(--primary)]">
                                Direct note
                            </p>
                            <h2
                                id="targeted-message-title"
                                className="text-2xl font-semibold leading-tight text-[var(--foreground)]"
                            >
                                {message.title}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => setMessage(null)}
                            className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]"
                            aria-label="Close message"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <p
                        id="targeted-message-body"
                        className="mt-5 whitespace-pre-wrap text-[0.95rem] leading-7 text-[var(--muted-foreground)]"
                    >
                        {message.message}
                    </p>

                    <div className="mt-7 flex justify-end border-t border-[var(--border-subtle)] pt-5">
                        <button
                            ref={acknowledgeButtonRef}
                            type="button"
                            onClick={() => setMessage(null)}
                            className="rounded-md bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
