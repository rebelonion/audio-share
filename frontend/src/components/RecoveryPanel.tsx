import {useEffect, useRef, useState} from 'react';
import {Check, Clipboard, Download, KeyRound, RefreshCw, ShieldCheck} from 'lucide-react';
import {Link} from 'react-router';
import {createRecoveryKey} from '@/lib/api';
import {useLikes} from '@/contexts/LikesContext';

type RecoveryErrorSource = 'create' | 'copy-key' | 'copy-link';

interface RecoveryError {
    message: string;
    source: RecoveryErrorSource;
}

export default function RecoveryPanel() {
    const {hasRecoveryKey, isLoading: isProfileLoading, isReady: isProfileReady, markRecoveryKeyCreated} = useLikes();
    const [recoveryKey, setRecoveryKey] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [confirmRotation, setConfirmRotation] = useState(false);
    const [isWorking, setIsWorking] = useState(false);
    const [copied, setCopied] = useState<'key' | 'link' | null>(null);
    const [error, setError] = useState<RecoveryError | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const replaceButtonRef = useRef<HTMLButtonElement>(null);
    const resultRef = useRef<HTMLDivElement>(null);
    const restoreTriggerFocusRef = useRef(false);

    useEffect(() => {
        if (!copied) return;
        const timeout = window.setTimeout(() => setCopied(null), 1800);
        return () => window.clearTimeout(timeout);
    }, [copied]);

    useEffect(() => {
        if (confirmRotation) replaceButtonRef.current?.focus();
    }, [confirmRotation]);

    useEffect(() => {
        if (recoveryKey) resultRef.current?.focus();
    }, [recoveryKey]);

    useEffect(() => {
        if (!confirmRotation && !recoveryKey && restoreTriggerFocusRef.current) {
            restoreTriggerFocusRef.current = false;
            triggerRef.current?.focus();
        }
    }, [confirmRotation, recoveryKey]);

    const recoveryUrl = recoveryKey
        ? `${window.location.origin}/recover#key=${encodeURIComponent(recoveryKey)}`
        : '';

    const generate = async () => {
        setIsWorking(true);
        setError(null);
        setQrDataUrl('');
        try {
            const key = await createRecoveryKey();
            // Keep the rotated text key even if QR rendering fails.
            setRecoveryKey(key);
            markRecoveryKeyCreated();
            setConfirmRotation(false);

            try {
                const url = `${window.location.origin}/recover#key=${encodeURIComponent(key)}`;
                const QRCode = await import('qrcode');
                setQrDataUrl(await QRCode.toDataURL(url, {
                    width: 640,
                    margin: 3,
                    color: {dark: '#131109', light: '#ece7de'},
                    errorCorrectionLevel: 'M',
                }));
            } catch {
                setError({
                    message: 'Recovery key created, but the QR code could not be generated. Save the text key or recovery link below.',
                    source: 'create',
                });
            }
        } catch {
            setError({
                message: 'Could not create a recovery key. Please try again.',
                source: 'create',
            });
        } finally {
            setIsWorking(false);
        }
    };

    const copy = async (value: string, type: 'key' | 'link') => {
        const source: RecoveryErrorSource = `copy-${type}`;
        setError(previous => previous?.source === source ? null : previous);
        try {
            await navigator.clipboard.writeText(value);
            setCopied(type);
        } catch {
            setError({
                message: 'Could not copy automatically. Select and copy the recovery key instead.',
                source,
            });
        }
    };

    return (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-[var(--border)]">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-[var(--secondary)] text-[var(--primary)]"><ShieldCheck className="h-5 w-5" /></div>
                    <div>
                        <h2 className="text-xl font-semibold">Keep your likes</h2>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)] max-w-2xl">
                            Create a recovery key to restore this profile in another browser.
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-5 sm:p-6">
                {error && <p id="recovery-panel-error" role="alert" className="mb-4 text-sm text-[var(--error-text)]">{error.message}</p>}
                {!recoveryKey && !confirmRotation && (
                    <div className="flex flex-col items-start gap-4">
                        <div className="text-sm text-[var(--muted-foreground)]">
                            {hasRecoveryKey
                                ? 'This profile already has a recovery key. Creating another invalidates the previous key and QR code.'
                                : 'Save the key text or QR code somewhere secure. It will be shown only once.'}
                            <div className="mt-2">
                                <Link to="/recover" className="text-[var(--primary)] hover:underline">
                                    Already have a recovery key?
                                </Link>
                            </div>
                        </div>
                        <button
                            ref={triggerRef}
                            type="button"
                            disabled={!isProfileReady || isProfileLoading || isWorking}
                            onClick={() => hasRecoveryKey ? setConfirmRotation(true) : void generate()}
                            aria-describedby={error?.source === 'create' ? 'recovery-panel-error' : undefined}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                            {hasRecoveryKey ? <RefreshCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                            {hasRecoveryKey ? 'Replace recovery key' : 'Create recovery key'}
                        </button>
                    </div>
                )}

                {confirmRotation && (
                    <div
                        role="group"
                        aria-labelledby="recovery-rotation-heading"
                        className="rounded-md border border-[var(--primary-soft-hover)] bg-[var(--primary-wash)] p-4"
                    >
                        <p id="recovery-rotation-heading" className="font-medium text-[var(--primary)]">Replace the existing recovery key?</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">Any previously saved text or QR code will stop working immediately.</p>
                        <div className="mt-4 flex gap-2">
                            <button
                                ref={replaceButtonRef}
                                type="button"
                                onClick={() => void generate()}
                                disabled={isWorking}
                                aria-describedby={error?.source === 'create' ? 'recovery-panel-error' : undefined}
                                className="px-4 py-2 rounded-md bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-colors"
                            >
                                {isWorking ? 'Creating…' : 'Replace key'}
                            </button>
                            <button
                                type="button"
                                disabled={isWorking}
                                onClick={() => {
                                    restoreTriggerFocusRef.current = true;
                                    setConfirmRotation(false);
                                }}
                                className="px-4 py-2 rounded-md border border-[var(--border)] hover:bg-[var(--card-hover)] disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {recoveryKey && (
                    <div
                        ref={resultRef}
                        tabIndex={-1}
                        role="region"
                        aria-labelledby="recovery-result-heading"
                        className="grid md:grid-cols-[220px_1fr] gap-6 animate-fadeIn focus:outline-none"
                    >
                        {qrDataUrl ? (
                            <div className="w-full max-w-[240px] mx-auto md:mx-0 rounded-lg bg-[var(--foreground)] p-3 self-start">
                                <img src={qrDataUrl} alt="Recovery QR code" className="w-full aspect-square" />
                            </div>
                        ) : (
                            <div className="flex w-full max-w-[240px] aspect-square mx-auto md:mx-0 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] p-6 text-center text-sm text-[var(--muted-foreground)] self-start">
                                <KeyRound className="h-8 w-8 text-[var(--primary)]" />
                                QR code unavailable
                            </div>
                        )}
                        <div className="min-w-0">
                            <div id="recovery-result-heading" role="status" className="flex items-center gap-2 text-[var(--success-text)]"><Check className="h-4 w-4" /> Recovery key created</div>
                            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                                Save this key now; it won’t be shown again. Treat it like a password: anyone with it can access and change your likes.
                            </p>
                            <div className="mt-4 rounded-md bg-[var(--background)] border border-[var(--border)] p-3 font-mono text-xs break-all select-all">{recoveryKey}</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void copy(recoveryKey, 'key')}
                                    aria-describedby={error?.source === 'copy-key' ? 'recovery-panel-error' : undefined}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border)] hover:border-[var(--primary)] text-sm"
                                >
                                    {copied === 'key' ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                                    {copied === 'key' ? 'Copied' : 'Copy key'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void copy(recoveryUrl, 'link')}
                                    aria-describedby={error?.source === 'copy-link' ? 'recovery-panel-error' : undefined}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border)] hover:border-[var(--primary)] text-sm"
                                >
                                    {copied === 'link' ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                                    {copied === 'link' ? 'Copied' : 'Copy recovery link'}
                                </button>
                                {qrDataUrl && (
                                    <a href={qrDataUrl} download="audio-share-recovery.png" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border)] hover:border-[var(--primary)] text-sm">
                                        <Download className="h-4 w-4" /> Save QR code
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
