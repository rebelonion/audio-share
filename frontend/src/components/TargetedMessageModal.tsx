import {useCallback, useEffect, useId, useRef, useState} from 'react';
import Dialog from '@/components/ui/Dialog';
import {Button, IconButton} from '@/components/ui/Button';
import {AudioLines, X} from 'lucide-react';
import {acknowledgeTargetedMessage, fetchTargetedMessage, type TargetedMessage} from '@/lib/targetedMessage';

export default function TargetedMessageModal() {
    const titleId = useId();
    const bodyId = useId();
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

    const dismissMessage = useCallback(() => {
        if (!message) return;
        setMessage(null);
        void acknowledgeTargetedMessage(message.id).catch(error => {
            console.error('Could not acknowledge targeted message:', error);
        });
    }, [message]);

    useEffect(() => {
        if (!message) return;

        if (trackedMessageIDRef.current !== message.id) {
            trackedMessageIDRef.current = message.id;
            window.rybbit?.onReady(rybbit => {
                rybbit.event('targeted-message-displayed', {messageId: message.id});
            });
        }
    }, [message]);

    if (!message) return null;

    return (
        <Dialog open onClose={dismissMessage} labelledBy={titleId} describedBy={bodyId} initialFocusRef={acknowledgeButtonRef}>
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
                            id={titleId}
                            className="text-2xl font-semibold leading-tight text-[var(--foreground)]"
                        >
                            {message.title}
                        </h2>
                    </div>
                    <IconButton
                        size="sm"
                        onClick={dismissMessage}
                        aria-label="Close message"
                    >
                        <X className="h-4 w-4" />
                    </IconButton>
                </div>

                <p
                    id={bodyId}
                    className="mt-5 whitespace-pre-wrap text-[0.95rem] leading-7 text-[var(--muted-foreground)]"
                >
                    {message.message}
                </p>

                <div className="mt-7 flex justify-end border-t border-[var(--border-subtle)] pt-5">
                    <Button
                        ref={acknowledgeButtonRef}
                        type="button"
                        onClick={dismissMessage}
                    >
                        Got it
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}
