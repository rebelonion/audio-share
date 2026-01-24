import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useUmami } from '@/hooks/useUmami';
import { API_BASE } from '@/lib/api';

interface RequestSourceDialogProps {
    isOpen: boolean;
    onCloseAction: () => void;
}

export default function RequestSourceDialog({ isOpen, onCloseAction }: RequestSourceDialogProps) {
    const { track } = useUmami();
    const [requestUrl, setRequestUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<{
        success?: boolean;
        message?: string;
    }>({});

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

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
                        onClick={onCloseAction}
                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                    </div>

                    {status.message && (
                        <div className={`mb-4 p-3 rounded-md ${status.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {status.message}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={onCloseAction}
                            className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] mr-2"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] flex items-center"
                            disabled={isSubmitting}
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
