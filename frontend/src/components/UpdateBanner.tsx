import {RefreshCw} from 'lucide-react';
import {useAppUpdate} from '@/hooks/useAppUpdate';

export default function UpdateBanner() {
    const updateAvailable = useAppUpdate();

    if (!updateAvailable) return null;

    return (
        <section
            className="border-b border-[rgba(196,136,42,0.45)] bg-[rgba(35,29,19,0.96)] text-[var(--foreground)]"
            aria-label="Site update"
            aria-live="polite"
        >
            <div className="px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center gap-3">
                    <RefreshCw className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-sm leading-6">
                        A new version is available.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="shrink-0 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                    >
                        Refresh now
                    </button>
                </div>
            </div>
        </section>
    );
}
