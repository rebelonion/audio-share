import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

interface MatureContentDialogProps {
    open: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    title?: string;
    description?: string;
    confirmLabel?: string;
}

export default function MatureContentDialog({
    open,
    onCancel,
    onConfirm,
    title = 'Mature content',
    description = 'This track is marked 18+. Continue playback?',
    confirmLabel = 'Continue',
}: MatureContentDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const previousFocus = document.activeElement;
        dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
        return () => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
                previousFocus.focus({preventScroll: true});
            }
        };
    }, [open]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
        } else if (event.key === 'Tab') {
            const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div
                ref={dialogRef}
                role="dialog"
                onKeyDown={handleKeyDown}
                aria-modal="true"
                aria-labelledby="mature-content-title"
                className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] animate-fadeIn"
            >
                <div className="flex items-start gap-3 border-b border-[var(--border)] p-4">
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-500">
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id="mature-content-title" className="text-base font-semibold text-[var(--foreground)]">
                            {title}
                        </h2>
                        <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
                            {description}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex justify-end gap-2 p-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)]"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
