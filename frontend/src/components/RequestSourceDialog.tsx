import React, { useState } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { useRybbit } from '@/hooks/useRybbit';
import { API_BASE } from '@/lib/api';

interface RequestSourceDialogProps {
    isOpen: boolean;
    onCloseAction: () => void;
}

export default function RequestSourceDialog({ isOpen, onCloseAction }: RequestSourceDialogProps) {
    const { track } = useRybbit();
    const [requestUrl, setRequestUrl] = useState('');
    const [hasAcknowledged, setHasAcknowledged] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<{
        success?: boolean;
        message?: string;
    }>({});

    const handleClose = () => {
        setRequestUrl('');
        setHasAcknowledged(false);
        setStatus({});
        onCloseAction();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!hasAcknowledged) {
            setStatus({
                success: false,
                message: 'Please confirm you understand the request rules before submitting.'
            });
            return;
        }

        if (!requestUrl.trim()) {
            setStatus({
                success: false,
                message: 'Please enter a url'
            });
            return;
        }

        setIsSubmitting(true);
        setStatus({});

        try {
            const response = await fetch(`${API_BASE}/api/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requestUrl: requestUrl })
            });

            const data = await response.json();

            if (!response.ok) {
                setStatus({
                    success: false,
                    message: data.message || data.error || 'Failed to submit request'
                });
                return;
            }

            setStatus({
                success: true,
                message: 'Request sent successfully!'
            });

            track('artist-request');
            setRequestUrl('');
            setHasAcknowledged(false);

            setTimeout(() => {
                onCloseAction();
                setStatus({});
            }, 2000);

        } catch (error) {
            console.error('Error submitting request:', error);
            setStatus({
                success: false,
                message: error instanceof Error ? error.message : 'An error occurred'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[var(--card)] rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--border)]">
                    <h3 className="text-lg font-medium text-[var(--foreground)]">Request New Artist</h3>
                    <button
                        onClick={handleClose}
                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4">
                    <div className="mb-4">
                        <label htmlFor="requestUrl" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                            Artist/Channel URL
                        </label>
                        <input
                            type="text"
                            id="requestUrl"
                            value={requestUrl}
                            onChange={(e) => setRequestUrl(e.target.value)}
                            placeholder="https://youtube.com/channel/..."
                            className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)]"
                            disabled={isSubmitting}
                        />
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Enter a YouTube, Twitch, or other content creator URL
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Requests are manually reviewed before appearing on the requests page.
                        </p>
                    </div>

                    <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--secondary)]/70 p-3">
                        <div className="mb-2 flex items-start gap-2 text-sm font-medium text-[var(--foreground)]">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--primary)]" />
                            <span>Before submitting, please confirm:</span>
                        </div>
                        <ul className="space-y-1.5 pl-6 text-sm leading-relaxed text-[var(--muted-foreground)]">
                            <li className="list-disc">This artist does not already exist in the archive.</li>
                            <li className="list-disc">NSFW or adult content will not be archived.</li>
                            <li className="list-disc">Requests can be rejected for any reason.</li>
                        </ul>
                        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 transition-colors hover:bg-[var(--card-hover)]">
                            <input
                                type="checkbox"
                                checked={hasAcknowledged}
                                onChange={(e) => setHasAcknowledged(e.target.checked)}
                                disabled={isSubmitting}
                                className="peer sr-only"
                            />
                            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--card)] text-transparent transition-colors peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary)] peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--primary)]">
                                <Check className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-sm font-medium text-[var(--foreground)]">I understand this</span>
                        </label>
                    </div>

                    {status.message && (
                        <div className={`mb-4 p-3 rounded-md ${status.success ? 'bg-[var(--success-bg)] border border-[var(--success-border)] text-[var(--success-text)]' : 'bg-[var(--error-bg)] border border-[var(--error-border)] text-[var(--error-text)]'}`}>
                            {status.message}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] mr-2"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] flex items-center disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--primary)]"
                            disabled={isSubmitting || !hasAcknowledged}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                'Submit Request'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
