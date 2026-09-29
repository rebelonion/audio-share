import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import {buttonClass} from '@/components/ui/buttonStyles';
import Alert from '@/components/ui/Alert';
import ErrorState from '@/components/ui/ErrorState';
import {Button} from '@/components/ui/Button';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Heart, ListMusic, Music, Play, ShieldAlert, Unlink} from 'lucide-react';
import {Link} from 'react-router';
import {Helmet} from 'react-helmet-async';
import RecoveryPanel from '@/components/RecoveryPanel';
import TrackQuickActions from '@/components/TrackQuickActions';
import {useLikes} from '@/contexts/LikesContext';
import {useAudioPlayerCommands} from '@/contexts/AudioPlayerContext';
import {playbackToPlayerTrack, trackArtworkUrl} from '@/lib/tracks';
import {getLikedTracks, type LikedTrack} from '@/lib/api';
import {DEFAULT_TITLE} from '@/lib/config';

function LikedTrackArtwork({track}: {track: LikedTrack}) {
    const [imageFailed, setImageFailed] = useState(false);
    const thumbnailUrl = trackArtworkUrl(track);

    if (!thumbnailUrl || imageFailed) {
        return <span className="flex h-full w-full items-center justify-center bg-[var(--secondary)]"><Music className="h-5 w-5 text-[var(--primary)]" /></span>;
    }

    return <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setImageFailed(true)} />;
}

export default function Likes() {
    const {
        isLiked,
        isReady,
        isLoading: isMembershipLoading,
        error: membershipError,
        committedMutationRevision,
        refreshLikes,
    } = useLikes();
    const [tracks, setTracks] = useState<LikedTrack[]>([]);
    const [areTracksLoading, setAreTracksLoading] = useState(true);
    const [tracksError, setTracksError] = useState<string | null>(null);
    const hasLoadedTracksRef = useRef(false);
    const {playContext} = useAudioPlayerCommands();
    const likedTracks = isReady ? tracks.filter(track => isLiked(track.shareKey)) : tracks;
    const playable = likedTracks.filter(track => !track.deleted);
    const isLoading = isMembershipLoading || (isReady && areTracksLoading);
    const error = membershipError || tracksError;

    const loadTracks = useCallback(async (signal?: AbortSignal, showLoading = true) => {
        if (showLoading) setAreTracksLoading(true);
        setTracksError(null);
        try {
            setTracks(await getLikedTracks(signal));
            hasLoadedTracksRef.current = true;
        } catch (loadError) {
            if (signal?.aborted) return;
            setTracksError(loadError instanceof Error ? loadError.message : 'Failed to load liked tracks');
        } finally {
            if (!signal?.aborted) setAreTracksLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isReady) return;
        const controller = new AbortController();
        void loadTracks(controller.signal, !hasLoadedTracksRef.current);
        return () => controller.abort();
    }, [committedMutationRevision, isReady, loadTracks]);

    const retry = () => membershipError
        ? refreshLikes()
        : loadTracks();

    const playTrack = (shareKey: string) => {
        const index = playable.findIndex(track => track.shareKey === shareKey);
        if (index < 0) return;
        playContext(playable.map(track => playbackToPlayerTrack(track, 'likes')), index, 'Liked tracks');
    };

    return (
        <div className="max-w-5xl mx-auto animate-slideUp">
            <Helmet><title>Likes - {DEFAULT_TITLE}</title></Helmet>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Heart className="h-7 w-7 text-[var(--primary)] fill-current" />
                        <h1 className="text-4xl font-bold italic">Your likes</h1>
                    </div>
                    {!isLoading && likedTracks.length > 0 && (
                        <p className="mt-1 pl-10 text-sm text-[var(--muted-foreground)]">
                            {likedTracks.length} saved {likedTracks.length === 1 ? 'track' : 'tracks'}
                        </p>
                    )}
                </div>
                {playable.length > 0 && (
                    <Button onClick={() => playTrack(playable[0].shareKey)}>
                        <Play className="h-4 w-4 fill-current" /> Play all
                    </Button>
                )}
            </div>

            {error && likedTracks.length > 0 && (
                <Alert className="mb-5 flex items-center justify-between gap-4">
                    <span>{error}</span>
                    <Button variant="link" onClick={() => void retry()} className="shrink-0">Try again</Button>
                </Alert>
            )}
            {isLoading ? (
                <div className="mb-10 space-y-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)]">{[0, 1, 2, 3].map(item => <div key={item} className="h-20 skeleton" />)}</div>
            ) : error && likedTracks.length === 0 ? (
                <ErrorState title="Likes aren’t available right now" onRetry={() => void retry()} className="mb-10">{error}</ErrorState>
            ) : likedTracks.length === 0 ? (
                <EmptyState title="Nothing liked yet" icon={Heart} variant="dashed" className="mb-10"
                    action={<Link to="/browse" className={buttonClass({})}><ListMusic className="h-4 w-4" /> Browse audio</Link>}>
                    Tap the heart beside a track to save it here.
                </EmptyState>
            ) : (
                <Card padding="none" className="mb-10 min-w-0">
                    {likedTracks.map(track => {
                        const missing = !!track.deleted;
                        const sourceUnavailable = !!track.unavailableAt;
                        const removalRequested = !!track.removalRequestedAt;
                        const playerTrack = playbackToPlayerTrack(track, 'likes');
                        return (
                            <div key={track.shareKey} className={`group flex w-full min-w-0 max-w-full items-center gap-3 border-t border-[var(--border)] p-3 first:border-t-0 sm:p-4 transition-colors ${missing ? 'opacity-60' : 'hover:bg-[var(--card-hover)]'}`}>
                                <button disabled={missing} onClick={() => playTrack(track.shareKey)} className="relative h-12 w-[4.5rem] overflow-hidden rounded-md bg-[var(--secondary)] disabled:cursor-not-allowed flex-shrink-0" aria-label={missing ? `${track.title || track.filename} is unavailable` : `Play ${track.title || track.filename}`}>
                                    <LikedTrackArtwork track={track} />
                                    {missing && (
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                                            <Unlink className="h-4 w-4" />
                                        </span>
                                    )}
                                    {!missing && removalRequested && (
                                        <Badge variant="overlay" size="sm" className="absolute right-1 top-1" title="Removal requested">
                                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                        </Badge>
                                    )}
                                </button>
                                <button disabled={missing} onClick={() => playTrack(track.shareKey)} className="min-w-0 flex-1 text-left disabled:cursor-default">
                                    <div className="font-medium truncate group-hover:text-[var(--primary)]">{track.title || track.filename}</div>
                                    <div className="text-xs text-[var(--muted-foreground)] truncate mt-1">
                                        {missing ? 'Audio file no longer available' : track.artist || track.parentFolderName || 'Unknown artist'}
                                        {!missing && removalRequested
                                            ? <Badge size="sm" className="ml-2">Removal requested</Badge>
                                            : sourceUnavailable && <span className="ml-2 text-amber-500">Original source unavailable</span>}
                                    </div>
                                </button>
                                <TrackQuickActions track={playerTrack} className="shrink-0" />
                            </div>
                        );
                    })}
                </Card>
            )}

            {isReady && <RecoveryPanel />}
        </div>
    );
}
