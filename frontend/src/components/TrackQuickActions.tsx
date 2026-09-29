import {IconButton} from '@/components/ui/Button';
import {Heart, ListPlus, ListStart} from 'lucide-react';
import type {MouseEvent} from 'react';
import type {AudioPlayerTrack} from '@/contexts/AudioPlayerContext';
import {useAudioPlayerCommands} from '@/contexts/AudioPlayerContext';
import {useLikes} from '@/contexts/LikesContext';
import {useToast} from '@/contexts/ToastContext';

interface TrackQuickActionsProps {
    track: AudioPlayerTrack;
    compact?: boolean;
    className?: string;
}

export default function TrackQuickActions({track, compact = false, className = ''}: TrackQuickActionsProps) {
    const {addToQueue, playNext} = useAudioPlayerCommands();
    const {isLiked, isLikePending, isLoading: likesLoading, isReady: likesReady, toggleLike} = useLikes();
    const toast = useToast();
    const liked = isLiked(track.shareKey);
    const likePending = isLikePending(track.shareKey);
    const size = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
    const queueDisabled = !!track.deleted;

    const stop = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
    };

    return (
        <div className={`flex items-center gap-1 ${className}`} onClick={stop}>
            <IconButton variant={liked ? 'selected' : 'subtle'} size={compact ? 'sm' : 'md'}
                type="button"
                disabled={!likesReady || likesLoading || likePending || !track.shareKey}
                onClick={async event => {
                    stop(event);
                    if (!track.shareKey || likePending) return;
                    const willLike = !liked;
                    const succeeded = await toggleLike(track.shareKey, track.source);
                    if (succeeded) {
                        toast.success(willLike ? 'Added to likes' : 'Removed from likes');
                    } else {
                        toast.error('Could not update like');
                    }
                }}
                aria-label={liked ? 'Unlike track' : 'Like track'}
                title={liked ? 'Unlike track' : 'Like track'}
            >
                <Heart className={`${size} ${liked ? 'fill-current' : ''}`} />
            </IconButton>
            <IconButton variant="subtle" size={compact ? 'sm' : 'md'}
                type="button"
                disabled={queueDisabled}
                onClick={event => {
                    stop(event);
                    if (queueDisabled) return;
                    const result = playNext(track);
                    if (result === 'ignored') return;
                    toast.success(result === 'playing'
                        ? 'Playing now'
                        : result === 'ready'
                            ? 'Ready to play'
                            : 'Added to play next');
                }}
                aria-label="Play next"
                title="Play next"
            >
                <ListStart className={size} />
            </IconButton>
            <IconButton variant="subtle" size={compact ? 'sm' : 'md'}
                type="button"
                disabled={queueDisabled}
                onClick={event => {
                    stop(event);
                    if (queueDisabled) return;
                    const result = addToQueue(track);
                    if (result === 'ignored') return;
                    toast.success(result === 'ready' ? 'Ready to play' : 'Added to queue');
                }}
                aria-label="Add to queue"
                title="Add to queue"
            >
                <ListPlus className={size} />
            </IconButton>
        </div>
    );
}
