import { AlertTriangle, X } from 'lucide-react';
import {useId} from 'react';
import Dialog from '@/components/ui/Dialog';
import {Button, IconButton} from '@/components/ui/Button';

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
    const titleId = useId();
    const descriptionId = useId();
    return (
        <Dialog open={open} onClose={onCancel} labelledBy={titleId} describedBy={descriptionId} className="max-w-sm">
            <div className="flex items-start gap-3 border-b border-[var(--border)] p-4">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-500">
                    <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="text-base font-semibold text-[var(--foreground)]">
                        {title}
                    </h2>
                    <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
                        {description}
                    </p>
                </div>
                <IconButton
                    size="sm"
                    onClick={onCancel}
                    aria-label="Close"
                >
                    <X className="h-4 w-4" />
                </IconButton>
            </div>
            <div className="flex justify-end gap-2 p-4">
                <Button
                    type="button"
                    onClick={onCancel}
                    variant="secondary"
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={onConfirm}
                >
                    {confirmLabel}
                </Button>
            </div>
        </Dialog>
    );
}
