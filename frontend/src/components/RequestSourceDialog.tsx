import Checkbox from '@/components/ui/Checkbox';
import {Input} from '@/components/ui/Field';
import Dialog from '@/components/ui/Dialog';
import Alert from '@/components/ui/Alert';
import {Button, IconButton} from '@/components/ui/Button';
import React, { useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Folder, Loader2, X } from 'lucide-react';
import { useRybbit } from '@/hooks/useRybbit';
import { API_BASE } from '@/lib/api';
import { appFetch, CloudflareChallengeError } from '@/lib/cloudflareChallenge';
import { BUILD_ID } from '@/lib/config';

interface RequestSourceDialogProps {
    isOpen: boolean;
    onCloseAction: () => void;
}

function createRequestId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function transportErrorMessage(error: unknown): string {
    if (error instanceof CloudflareChallengeError) {
        return 'Your security check expired. Reload to verify, then try again.';
    }
    if (!navigator.onLine) {
        return 'You appear to be offline. Reconnect and try again.';
    }
    return 'We couldn\'t send your request right now. Please try again later.';
}

function getApiOrigin(): string {
    try {
        return new URL(API_BASE || window.location.origin, window.location.origin).origin;
    } catch {
        return 'invalid';
    }
}

export default function RequestSourceDialog({ isOpen, onCloseAction }: RequestSourceDialogProps) {
    const titleId = useId();
    const urlId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const { track } = useRybbit();
    const [requestUrl, setRequestUrl] = useState('');
    const [hasAcknowledged, setHasAcknowledged] = useState(false);
    const [hasHigherRemovalRisk, setHasHigherRemovalRisk] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<{
        success?: boolean;
        message?: string;
        folderPath?: string;
    }>({});

    const handleClose = () => {
        setRequestUrl('');
        setHasAcknowledged(false);
        setHasHigherRemovalRisk(false);
        setStatus({});
        onCloseAction();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!hasAcknowledged) {
            setStatus({
                success: false,
                message: 'Check the box to confirm you understand the request rules.'
            });
            return;
        }

        if (!requestUrl.trim()) {
            setStatus({
                success: false,
                message: 'Please enter a URL.'
            });
            return;
        }

        setIsSubmitting(true);
        setStatus({});
        const requestId = createRequestId();
        const startedAt = performance.now();

        try {
            const response = await appFetch(`${API_BASE}/api/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Request-ID': requestId,
                },
                body: JSON.stringify({
                    requestUrl,
                    hasHigherRemovalRisk,
                })
            });

            const data = await response.json();

            if (!response.ok) {
                setStatus({
                    success: false,
                    message: data.message || data.error || 'Failed to submit request',
                    folderPath: data.code === 'source_exists' ? data.existing?.folderPath : undefined,
                });
                track('artist-request-failed', {
                    reason: typeof data.code === 'string' ? data.code : 'http_error',
                    status: response.status,
                    requestId,
                    requestUrl: requestUrl.trim(),
                });
                return;
            }

            setStatus({
                success: true,
                message: 'Request sent.'
            });

            track('artist-request');
            setRequestUrl('');
            setHasAcknowledged(false);
            setHasHigherRemovalRisk(false);

            setTimeout(() => {
                onCloseAction();
                setStatus({});
            }, 2000);

        } catch (error) {
            console.error('Error submitting request:', error);
            setStatus({
                success: false,
                message: transportErrorMessage(error),
            });
            const apiOrigin = getApiOrigin();
            track('artist-request-failed', {
                reason: error instanceof CloudflareChallengeError
                    ? 'cloudflare_challenge'
                    : navigator.onLine ? 'network_error' : 'offline',
                requestId,
                requestUrl: requestUrl.trim(),
                durationMs: Math.round(performance.now() - startedAt),
                online: navigator.onLine,
                visibilityState: document.visibilityState,
                apiOrigin,
                sameOrigin: apiOrigin === window.location.origin,
                errorName: error instanceof Error ? error.name : typeof error,
                errorMessage: error instanceof Error ? error.message.slice(0, 200) : '',
                buildId: BUILD_ID,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onClose={handleClose} labelledBy={titleId} initialFocusRef={inputRef}>
            <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--border)]">
                <h3 id={titleId} className="text-lg font-medium text-[var(--foreground)]">Request a source</h3>
                <IconButton
                    size="sm"
                    onClick={handleClose}
                    aria-label="Close"
                >
                    <X className="h-5 w-5" />
                </IconButton>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
                <div className="mb-4">
                    <label htmlFor={urlId} className="block text-sm font-medium text-[var(--foreground)] mb-1">
                        Artist or channel URL
                    </label>
                    <Input
                        type="text"
                        id={urlId}
                        ref={inputRef}
                        value={requestUrl}
                        onChange={(e) => setRequestUrl(e.target.value)}
                        placeholder="https://youtube.com/channel/..."
                        disabled={isSubmitting}
                    />
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                        Enter a YouTube, Twitch, or other creator URL.
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                        Requests are manually reviewed before appearing on the requests page.
                    </p>
                </div>

                <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 transition-colors hover:border-[var(--primary-border)] hover:bg-[var(--card-hover)]">
                    <Checkbox
                        checked={hasHigherRemovalRisk}
                        onChange={(e) => setHasHigherRemovalRisk(e.target.checked)}
                        disabled={isSubmitting}
                    />
                    <span>
                        <span className="block text-sm font-medium text-[var(--foreground)]">
                            This channel has a higher chance of having content removed
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted-foreground)]">
                            Select this if uploads may disappear and should be prioritized.
                        </span>
                    </span>
                </label>

                <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--secondary-translucent)] p-3">
                    <div className="mb-2 flex items-start gap-2 text-sm font-medium text-[var(--foreground)]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--primary)]" />
                        <span>Request rules</span>
                    </div>
                    <ul className="space-y-1.5 pl-6 text-sm leading-relaxed text-[var(--muted-foreground)]">
                        <li className="list-disc">This artist does not already exist in the archive.</li>
                        <li className="list-disc">NSFW, fetish or adult content will not be archived.</li>
                        <li className="list-disc">Requests can be rejected for any reason.</li>
                    </ul>
                    <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 transition-colors hover:bg-[var(--card-hover)]">
                        <Checkbox
                            checked={hasAcknowledged}
                            onChange={(e) => setHasAcknowledged(e.target.checked)}
                            disabled={isSubmitting}
                        />
                        <span className="text-sm font-medium text-[var(--foreground)]">I understand these rules</span>
                    </label>
                </div>

                {status.message && (
                    <Alert variant={status.success ? 'success' : 'error'} className="mb-4">
                        <div>{status.message}</div>
                        {status.folderPath && (
                            <Link
                                to={`/browse/${status.folderPath.split('/').map(encodeURIComponent).join('/')}`}
                                onClick={handleClose}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-current px-2.5 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
                            >
                                <Folder className="h-4 w-4" />
                                Browse
                            </Link>
                        )}
                    </Alert>
                )}

                <div className="flex justify-end gap-2">
                    <Button
                        type="button"
                        onClick={handleClose}
                        variant="secondary"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting || !hasAcknowledged}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Sending…
                            </>
                        ) : (
                            'Send request'
                        )}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
