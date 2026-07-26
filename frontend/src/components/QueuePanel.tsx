import {ListMusic, Radio, Trash2, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';

const QUEUE_ROW_HEIGHT = 52;
const QUEUE_OVERSCAN = 4;

export default function QueuePanel({onClose}: {onClose: () => void}) {
    const {currentTrack, upcoming, contextLabel, autoplay, toggleAutoplay, removeFromQueue, clearQueue} = useGlobalAudioPlayer();
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(280);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const updateHeight = () => setViewportHeight(list.clientHeight);
        updateHeight();
        const observer = new ResizeObserver(updateHeight);
        observer.observe(list);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const startIndex = Math.max(0, Math.floor(scrollTop / QUEUE_ROW_HEIGHT) - QUEUE_OVERSCAN);
    const endIndex = Math.min(
        upcoming.length,
        Math.ceil((scrollTop + viewportHeight) / QUEUE_ROW_HEIGHT) + QUEUE_OVERSCAN,
    );
    const visibleTracks = upcoming.slice(startIndex, endIndex);

    return (
        <div
            className="fixed z-[60] sm:bottom-4 sm:right-[21rem] sm:w-80 sm:h-[min(34rem,calc(100vh-2rem))] max-sm:inset-4 rounded-lg border border-[var(--border)] bg-[var(--card)] flex flex-col animate-slideUp"
            style={{contain: 'layout paint style', isolation: 'isolate'}}
            role="dialog"
            aria-label="Playback queue"
        >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <div>
                    <div className="flex items-center gap-2 font-semibold"><ListMusic className="h-4 w-4 text-[var(--primary)]" /> Queue</div>
                    <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">{contextLabel || 'Listening now'}</div>
                </div>
                <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]" aria-label="Close queue"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-3 border-b border-[var(--border)]">
                <button onClick={toggleAutoplay} className="w-full flex items-center justify-between gap-3 rounded-md bg-[var(--secondary)] px-3 py-2.5 text-left hover:bg-[var(--muted)]" role="switch" aria-checked={autoplay}>
                    <span className="flex items-center gap-2 text-sm"><Radio className="h-4 w-4 text-[var(--primary)]" /> Autoplay recommendations</span>
                    <span className={`relative h-5 w-9 rounded-full transition-colors ${autoplay ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${autoplay ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </span>
                </button>
                <p className="mt-2 px-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">After this queue ends, continue with related tracks.</p>
            </div>

            {currentTrack && (
                <div className="p-3 border-b border-[var(--border)]">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Now playing</div>
                    <div className="rounded-md border border-[var(--primary-border)] bg-[var(--primary-wash)] p-3">
                        <div className="font-medium text-sm line-clamp-2">{currentTrack.name}</div>
                        {currentTrack.artist && <div className="mt-1 text-xs text-[var(--muted-foreground)] truncate">{currentTrack.artist}</div>}
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Up next · {upcoming.length}</div>
                {upcoming.length > 0 && <button onClick={clearQueue} className="rounded px-1.5 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--error-text)]">Clear</button>}
            </div>
            {upcoming.length === 0 ? (
                <div className="flex-1 px-5 py-8 text-center text-xs text-[var(--muted-foreground)]">Add a track to the queue, or let autoplay choose what follows.</div>
            ) : (
                <div
                    ref={listRef}
                    className="custom-scrollbar flex-1 min-h-0 overflow-y-auto"
                    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
                >
                    <div className="relative" style={{height: upcoming.length * QUEUE_ROW_HEIGHT}}>
                        {visibleTracks.map((track, offset) => {
                            const index = startIndex + offset;
                            return (
                            <div
                                key={track.id}
                                className="group absolute left-3 right-3 flex items-center gap-2 rounded-md px-2 hover:bg-[var(--card-hover)]"
                                style={{height: QUEUE_ROW_HEIGHT, transform: `translateY(${index * QUEUE_ROW_HEIGHT}px)`}}
                            >
                                <span className="w-5 text-center text-[10px] text-[var(--muted-foreground)] tabular-nums">{index + 1}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm truncate">{track.name}</div>
                                    <div className="text-[11px] text-[var(--muted-foreground)] truncate">{track.queuePlacement ? 'Added to queue' : track.artist || contextLabel || 'Up next'}</div>
                                </div>
                                <button onClick={() => removeFromQueue(track.id)} className="flex h-8 w-8 items-center justify-center rounded-md opacity-70 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--error-text)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-opacity" aria-label={`Remove ${track.name} from queue`}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
