import {Check, Heart, ListPlus, ListStart, TriangleAlert} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {AudioPlayerTrack} from '@/contexts/AudioPlayerContext';
import {useAudioPlayerCommands} from '@/contexts/AudioPlayerContext';
import {useLikes} from '@/contexts/LikesContext';

interface TrackQuickActionsProps {
    track: AudioPlayerTrack;
    compact?: boolean;
    className?: string;
}

export default function TrackQuickActions({track, compact = false, className = ''}: TrackQuickActionsProps) {
    const {addToQueue, playNext} = useAudioPlayerCommands();
    const {isLiked, isLikePending, isLoading: likesLoading, isReady: likesReady, toggleLike} = useLikes();
    const liked = isLiked(track.shareKey);
    const likePending = isLikePending(track.shareKey);
    const size = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
    const buttonClass = compact
        ? 'p-2 sm:p-1 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--primary)]'
        : 'p-1.5 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--muted)]';
    const queueDisabled = !!track.deleted;
    const [feedback, setFeedback] = useState<{action: 'like' | 'next' | 'queue'; message: string; error?: boolean} | null>(null);
    const feedbackTimerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    }, []);

    const showFeedback = useCallback((next: NonNullable<typeof feedback>) => {
        if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
        setFeedback(next);
        feedbackTimerRef.current = window.setTimeout(() => {
            setFeedback(null);
            feedbackTimerRef.current = null;
        }, 1800);
    }, []);

    const stop = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
    };

    return (
        <div className={`flex items-center gap-1 ${className}`}>
            <button
                type="button"
                disabled={!likesReady || likesLoading || likePending || !track.shareKey}
                className={`${buttonClass} ${liked ? 'text-[var(--primary)]' : ''} transition-colors disabled:opacity-50`}
                onClick={async event => {
                    stop(event);
                    if (!track.shareKey || likePending) return;
                    const willLike = !liked;
                    const succeeded = await toggleLike(track.shareKey, track.source);
                    showFeedback({
                        action: 'like',
                        message: succeeded ? (willLike ? 'Added to likes' : 'Removed from likes') : 'Could not update like',
                        error: !succeeded,
                    });
                }}
                aria-label={liked ? 'Unlike track' : 'Like track'}
                title={liked ? 'Unlike track' : 'Like track'}
            >
                {feedback?.action === 'like' && feedback.error
                    ? <TriangleAlert className={size} />
                    : <Heart className={`${size} ${liked ? 'fill-current' : ''}`} />
                }
            </button>
            <button
                type="button"
                disabled={queueDisabled}
                className={`${buttonClass} transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-[var(--muted-foreground)]`}
                onClick={event => {
                    stop(event);
                    if (queueDisabled) return;
                    const result = playNext(track);
                    if (result === 'ignored') return;
                    showFeedback({
                        action: 'next',
                        message: result === 'playing'
                            ? 'Playing now'
                            : result === 'ready'
                                ? 'Ready to play'
                                : 'Added to play next',
                    });
                }}
                aria-label="Play next"
                title="Play next"
            >
                {feedback?.action === 'next' ? <Check className={size} /> : <ListStart className={size} />}
            </button>
            <button
                type="button"
                disabled={queueDisabled}
                className={`${buttonClass} transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-[var(--muted-foreground)]`}
                onClick={event => {
                    stop(event);
                    if (queueDisabled) return;
                    const result = addToQueue(track);
                    if (result === 'ignored') return;
                    showFeedback({
                        action: 'queue',
                        message: result === 'ready' ? 'Ready to play' : 'Added to queue',
                    });
                }}
                aria-label="Add to queue"
                title="Add to queue"
            >
                {feedback?.action === 'queue' ? <Check className={size} /> : <ListPlus className={size} />}
            </button>
            {feedback && createPortal(
                <div
                    className={`fixed bottom-24 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-lg animate-fadeIn ${feedback.error ? 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)]' : 'border-[var(--primary-border)] bg-[var(--card)] text-[var(--foreground)]'}`}
                    role="status"
                    aria-live="polite"
                >
                    {feedback.error ? <TriangleAlert className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-[var(--primary)]" />}
                    {feedback.message}
                </div>,
                document.body,
            )}
        </div>
    );
}
