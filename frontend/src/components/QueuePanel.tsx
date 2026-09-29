import EmptyState from '@/components/ui/EmptyState';
import {Button, IconButton} from '@/components/ui/Button';
import Switch from '@/components/ui/Switch';
import {ListMusic, Radio, Trash2, X} from 'lucide-react';
import {useEffect, useRef, useState, type CSSProperties, type RefObject} from 'react';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';

const QUEUE_ROW_HEIGHT = 52;
const QUEUE_OVERSCAN = 4;

interface QueuePanelProps {
    onClose: () => void;
    triggerRef: RefObject<HTMLButtonElement | null>;
    id?: string;
    className?: string;
    style?: CSSProperties;
}

export default function QueuePanel({onClose, triggerRef, id, className, style}: QueuePanelProps) {
    const {currentTrack, upcoming, contextLabel, autoplay, toggleAutoplay, removeFromQueue, clearQueue} = useGlobalAudioPlayer();
    const hasUpcoming = upcoming.length > 0;
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        closeRef.current?.focus({preventScroll: true});
        return () => {
            // The player may replace its trigger at a responsive breakpoint while the queue is open.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            triggerRef.current?.focus({preventScroll: true});
        };
    }, [triggerRef]);
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(280);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const updateHeight = () => setViewportHeight(list.clientHeight);
        updateHeight();
        setScrollTop(list.scrollTop);
        const observer = new ResizeObserver(updateHeight);
        observer.observe(list);
        return () => observer.disconnect();
    }, [hasUpcoming]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) onClose();
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
            id={id}
            className={`${className ?? 'fixed z-[60] sm:bottom-4 sm:right-[21rem] sm:w-80 sm:h-[min(34rem,calc(100vh-2rem))] max-sm:inset-4'} rounded-lg border border-[var(--border)] bg-[var(--card)] flex flex-col overflow-y-auto animate-slideUp`}
            style={{contain: 'layout paint style', isolation: 'isolate', ...style}}
            role="dialog"
            aria-label="Playback queue"
        >
            <div className="queue-heading shrink-0 flex items-center justify-between p-4 border-b border-[var(--border)]">
                <div>
                    <div className="flex items-center gap-2 font-semibold"><ListMusic className="h-4 w-4 text-[var(--primary)]" /> Queue</div>
                    <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">{contextLabel || 'Listening now'}</div>
                </div>
                <IconButton ref={closeRef} onClick={onClose} aria-label="Close queue"><X className="h-4 w-4" /></IconButton>
            </div>

            {currentTrack && (
                <div className="queue-current shrink-0 p-3 border-b border-[var(--border)]">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Now playing</div>
                    <div className="rounded-md border border-[var(--primary-border)] bg-[var(--primary-wash)] p-3">
                        <div className="font-medium text-sm line-clamp-2">{currentTrack.name}</div>
                        {currentTrack.artist && <div className="mt-1 text-xs text-[var(--muted-foreground)] truncate">{currentTrack.artist}</div>}
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Up next · {upcoming.length}</div>
                {upcoming.length > 0 && <Button variant="ghost" size="sm" onClick={clearQueue}>Clear</Button>}
            </div>
            {upcoming.length === 0 ? (
                <EmptyState compact className="flex-1" title="Add a track to the queue, or let autoplay choose what follows." />
            ) : (
                <div
                    ref={listRef}
                    className="custom-scrollbar flex-1 min-h-[104px] overflow-y-auto"
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
                                <IconButton onClick={() => removeFromQueue(track.id)} className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label={`Remove ${track.name} from queue`}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                            </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="queue-autoplay shrink-0 p-3 border-t border-[var(--border)]">
                <Switch checked={autoplay} onChange={toggleAutoplay} className="w-full bg-[var(--secondary)] px-3 py-2.5 hover:bg-[var(--muted)]">
                    <Radio className="h-4 w-4 shrink-0 text-[var(--primary)]" /> Autoplay recommendations
                </Switch>
                <p className="mt-2 px-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">After this queue ends, continue with related tracks.</p>
            </div>
        </div>
    );
}
