import {useState, useRef, useEffect, type MouseEvent} from 'react';
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    AlertCircle,
    Info,
    ExternalLink,
    Calendar,
    ChevronsDown,
    ChevronsUp,
    MinusCircle,
    Expand,
    Loader2,
    Heart,
    ListMusic,
    Share2,
    SkipBack,
    SkipForward,
    X
} from 'lucide-react';
import WaveformDisplay from '@/components/WaveformDisplay';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';
import {useAudioPlayerKeybinds} from '@/hooks/useAudioPlayerKeybinds';
import QueuePanel from '@/components/QueuePanel';
import {useLikes} from '@/contexts/LikesContext';
import {useToast} from '@/contexts/ToastContext';
import {audioShareUrl} from '@/lib/share';

function formatTime(time: number): string {
    const safe = Number.isFinite(time) ? time : 0;
    return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, '0')}`;
}

export default function AudioPlayer() {
    const [isMinimized, setIsMinimized] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [showQueue, setShowQueue] = useState(false);
    const progressRef = useRef<HTMLDivElement>(null);

    const {
        currentTrack,
        isPlaying,
        duration,
        currentTime,
        volume,
        isMuted,
        error,
        notice,
        thumbnail,
        metadata,
        audioLoaded,
        isLoading,
        artist,
        track,
        waveformPeaks,
        upcoming,
        skipNext,
        skipPrevious,
        closePlayer,
        togglePlay,
        toggleMute,
        seekTo,
        setVolume,
    } = useGlobalAudioPlayer();
    const toast = useToast();
    const {isLiked, isLikePending, isLoading: likesLoading, isReady: likesReady, toggleLike} = useLikes();
    const liked = isLiked(currentTrack?.shareKey);
    const likePending = isLikePending(currentTrack?.shareKey);

    const isMature = !!metadata?.isMature || (typeof currentTrack?.ageLimit === 'number' && currentTrack.ageLimit >= 18);
    const canShowMatureDetails = !isMature || !!metadata?.showMature;

    useAudioPlayerKeybinds({onTogglePlay: togglePlay});

    useEffect(() => {
        const mobile = window.matchMedia('(max-width: 639px)');
        const applyResponsiveDefault = () => setIsMinimized(mobile.matches);
        applyResponsiveDefault();
        mobile.addEventListener('change', applyResponsiveDefault);
        return () => mobile.removeEventListener('change', applyResponsiveDefault);
    }, []);

    useEffect(() => {
        if (currentTrack?.source === 'share' && window.matchMedia('(max-width: 639px)').matches) {
            setIsMinimized(true);
        }
        setIsDescriptionExpanded(false);
    }, [currentTrack?.source, currentTrack?.src]);

    useEffect(() => {
        if (currentTrack) {
            document.body.dataset.audioPlayer = 'visible';
        } else {
            delete document.body.dataset.audioPlayer;
        }
        return () => {
            delete document.body.dataset.audioPlayer;
        };
    }, [currentTrack]);

    const toggleMinimize = () => {
        setIsMinimized(!isMinimized);
    };

    const toggleDescriptionExpand = () => {
        setIsDescriptionExpanded(!isDescriptionExpanded);
    };

    const handleClosePlayer = () => {
        setShowQueue(false);
        closePlayer();
    };

    const handleProgressClick = (event: MouseEvent<HTMLDivElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        seekTo(((event.clientX - bounds.left) / bounds.width) * duration);
    };

    if (!currentTrack) return null;

    const copyShareLink = async () => {
        if (!navigator.clipboard) {
            toast.error('Copy feature not supported in this browser');
            return;
        }

        try {
            await navigator.clipboard.writeText(audioShareUrl(currentTrack.shareKey));
            toast.success('Share link copied to clipboard!');
        } catch {
            toast.error('Failed to copy to clipboard');
        }
    };

    return (
        <>
        <div
            className={`fixed bottom-4 z-50 overflow-x-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition-[width] duration-200 ease-out max-sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] max-sm:left-4 max-sm:right-4 max-sm:w-auto sm:right-4 ${isMinimized ? 'sm:w-96' : 'sm:w-80 max-sm:max-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] max-sm:overflow-y-auto max-sm:overscroll-contain'}`}
            style={{
                contain: 'layout paint style',
                isolation: 'isolate',
            }}
        >
            {isMinimized ? (
                <div className="flex items-center gap-2 px-2.5 py-2.5">
                    <div className="relative flex-shrink-0">
                        <button
                            onClick={togglePlay}
                            className="relative p-2 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors duration-200 focus:outline-none"
                            aria-label={isPlaying ? "Pause" : "Play"}
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin"/>
                            ) : isPlaying ? (
                                <Pause className="h-4 w-4"/>
                            ) : (
                                <Play className="h-4 w-4"/>
                            )}
                        </button>
                    </div>
                    <button type="button" onClick={toggleMinimize} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label="Open full player">
                        <span className="flex h-10 w-14 flex-shrink-0 overflow-hidden rounded bg-[var(--secondary)]">
                            {thumbnail ? (
                                <img src={thumbnail} alt="" width={56} height={40} className="h-full w-full object-cover" />
                            ) : (
                                <span className="flex h-full w-full items-center justify-center"><ListMusic className="h-4 w-4 text-[var(--muted-foreground)]" /></span>
                            )}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-[var(--foreground)]">{metadata?.title || track}</span>
                            <span
                                className="block truncate text-xs text-[var(--muted-foreground)]"
                                role={notice ? 'status' : undefined}
                            >
                                {notice || metadata?.artist || artist}
                            </span>
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowQueue(value => !value)}
                        className="flex flex-shrink-0 items-center gap-1 rounded-full bg-[var(--secondary)] px-2 py-1.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                        aria-label={`Open queue, ${upcoming.length} ${upcoming.length === 1 ? 'track' : 'tracks'} upcoming`}
                        title="Open queue"
                    >
                        <ListMusic className="h-3.5 w-3.5" />
                        <span className="min-w-3 text-center text-[10px] font-medium tabular-nums text-[var(--foreground)]">{upcoming.length > 99 ? '99+' : upcoming.length}</span>
                    </button>
                    <button
                        type="button"
                        onClick={toggleMinimize}
                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
                        aria-label="Expand player"
                        title="Expand player"
                    >
                        <Expand className="h-3.5 w-3.5"/>
                    </button>
                </div>
            ) : (
                <>
                <div className="flex items-center justify-between p-2.5 border-b border-[var(--border)]">
                    <button
                        onClick={() => void toggleLike(currentTrack.shareKey, currentTrack.source)}
                        disabled={!likesReady || likesLoading || likePending}
                        className={`p-1 text-[var(--muted-foreground)] hover:text-[var(--primary)] ${liked ? 'text-[var(--primary)]' : ''}`}
                        aria-label={liked ? 'Unlike track' : 'Like track'}
                        title={liked ? 'Unlike track' : 'Like track'}
                    >
                        <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                    </button>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => void copyShareLink()} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label="Copy share link" title="Copy share link">
                            <Share2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => setShowQueue(value => !value)} className="relative p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label="Open queue" title="Open queue">
                            <ListMusic className="h-4 w-4" />
                            {upcoming.length > 0 && <span className="absolute -right-1 -top-1 min-w-3 h-3 px-0.5 rounded-full bg-[var(--primary)] text-white text-[8px] flex items-center justify-center">{Math.min(99, upcoming.length)}</span>}
                        </button>
                        <button onClick={toggleMinimize} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label="Minimize player" title="Minimize player"><MinusCircle className="h-4 w-4"/></button>
                        <button onClick={handleClosePlayer} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--error-text)]" aria-label="Close and clear queue" title="Close and clear queue"><X className="h-4 w-4"/></button>
                    </div>
                </div>

                <div className="p-3">
                    <div className="flex flex-col mb-3">
                        <div className="mx-auto mb-3 h-28 w-48 overflow-hidden rounded-md bg-[var(--secondary)]">
                            {thumbnail ? (
                                <img
                                    src={thumbnail}
                                    alt={`${metadata?.title || track} thumbnail`}
                                    width={192}
                                    height={112}
                                    loading="eager"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-[var(--muted-foreground)]">
                                    <ListMusic className="h-7 w-7 opacity-40" />
                                </div>
                            )}
                        </div>

                        <div className="text-center">
                            <div className="flex items-start justify-center gap-2">
                                <div className="font-medium text-[var(--foreground)] line-clamp-3">
                                    {metadata?.title || track}
                                </div>
                                {isMature && <span className="mt-0.5 flex-shrink-0 text-[10px] font-semibold text-amber-400">18+</span>}
                            </div>
                            <div className="text-sm text-[var(--muted-foreground)] truncate">
                                {metadata?.artist || artist}
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-3 flex items-center rounded border border-[var(--error-border)] bg-[var(--error-bg)] p-2 text-[var(--error-text)] animate-fadeIn">
                            <Info className="mr-2 h-4 w-4 flex-shrink-0"/>
                            <span className="text-xs">{error}</span>
                        </div>
                    )}
                    {notice && (
                        <div
                            className="mb-3 flex items-center rounded border border-[var(--border)] bg-[var(--secondary)] p-2 text-[var(--foreground)] animate-fadeIn"
                            role="status"
                        >
                            <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0"/>
                            <span className="text-xs">{notice}</span>
                        </div>
                    )}

                    <div className="mb-3">
                        {waveformPeaks ? (
                            <WaveformDisplay
                                peaks={waveformPeaks}
                                progress={currentTime / (duration || (metadata?.duration || 1))}
                                onClick={handleProgressClick}
                                progressRef={progressRef}
                                height={32}
                                className="mb-2"
                            />
                        ) : (
                            <div
                                ref={progressRef}
                                className="group flex h-8 w-full cursor-pointer items-center mb-2"
                                onClick={handleProgressClick}
                            >
                                <div
                                    className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)] transition-[height] duration-150 group-hover:h-3"
                                >
                                    <div
                                        className="h-full bg-[var(--primary)] rounded-full"
                                        style={{
                                            width: `${(currentTime / (duration || (metadata?.duration || 1))) * 100 || 0}%`,
                                            opacity: audioLoaded ? 1 : 0.7
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                                {isPlaying || currentTime > 0 ? formatTime(currentTime) : "0:00"}
                            </span>

                            <div className="flex items-center gap-2">
                                <button onClick={skipPrevious} className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label="Previous track" title="Previous track"><SkipBack className="h-4 w-4 fill-current" /></button>
                                <button
                                    onClick={togglePlay}
                                    className="p-3 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors duration-200 focus:outline-none"
                                    aria-label={isPlaying ? "Pause" : "Play"}
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-6 w-6 animate-spin"/>
                                    ) : isPlaying ? (
                                        <Pause className="h-6 w-6"/>
                                    ) : (
                                        <Play className="h-6 w-6"/>
                                    )}
                                </button>
                                <button onClick={skipNext} className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label="Next track" title="Next track"><SkipForward className="h-4 w-4 fill-current" /></button>
                            </div>

                            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                                {formatTime(duration || (metadata?.duration || 0))}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 mb-2">
                        <button
                            onClick={toggleMute}
                            className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors focus:outline-none"
                            aria-label={isMuted ? "Unmute" : "Mute"}
                        >
                            {isMuted ? <VolumeX className="h-4 w-4"/> : <Volume2 className="h-4 w-4"/>}
                        </button>

                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={event => setVolume(Number.parseFloat(event.target.value))}
                            className="flex-grow"
                            aria-label="Volume"
                        />
                    </div>

                    <div>
                        {(metadata?.uploadDate || metadata?.webpageUrl) && (
                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
                                {metadata?.uploadDate && (
                                    <div className="flex min-w-0 items-center">
                                        <Calendar className="h-3 w-3 mr-1"/>
                                        <span>{`${metadata.uploadDate.substring(0, 4)}-${metadata.uploadDate.substring(4, 6)}-${metadata.uploadDate.substring(6, 8)}`}</span>
                                    </div>
                                )}

                                {metadata?.webpageUrl && (
                                    <a
                                        href={metadata.webpageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-auto flex min-w-0 items-center hover:text-[var(--primary)] transition-colors"
                                    >
                                        <ExternalLink className="h-3 w-3 mr-1"/>
                                        <span className="truncate">Original source</span>
                                    </a>
                                )}
                            </div>
                        )}

                        {metadata?.description && canShowMatureDetails && (
                            <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                                <button
                                    onClick={toggleDescriptionExpand}
                                    className="flex w-full items-center justify-between rounded px-1 py-1.5 text-left font-medium hover:bg-[var(--card-hover-subtle)] hover:text-[var(--foreground)] transition-colors"
                                    aria-expanded={isDescriptionExpanded}
                                >
                                    <span>Description</span>
                                    <span className="p-0.5" aria-hidden="true">
                                        {isDescriptionExpanded ? <ChevronsUp className="h-3 w-3"/> :
                                            <ChevronsDown className="h-3 w-3"/>}
                                    </span>
                                </button>
                                {isDescriptionExpanded && (
                                    <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-line rounded bg-[var(--card-hover-subtle)] p-2 custom-scrollbar animate-fadeIn">
                                        {metadata.description}
                                    </div>
                                )}
                            </div>
                        )}
                        {metadata?.description && !canShowMatureDetails && (
                            <div className="mt-3 text-xs text-[var(--muted-foreground)] rounded bg-[var(--card-hover-subtle)] p-2">
                                Description hidden for mature content.
                            </div>
                        )}
                    </div>
                </div>
            </>
            )}
        </div>
        {showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}
        </>
    );
}
