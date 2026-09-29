import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import {Slider} from '@/components/ui/Slider';
import {Button, IconButton} from '@/components/ui/Button';
import {lazy, Suspense, useState, useRef, useEffect, useId} from 'react';
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
    RotateCcw,
    RotateCw,
    SkipBack,
    SkipForward,
    Mountain,
    X
} from 'lucide-react';
import PlaybackSeek from '@/components/PlaybackSeek';
import WaveformDisplay from '@/components/WaveformDisplay';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';
import {useAudioPlayerKeybinds} from '@/hooks/useAudioPlayerKeybinds';
import QueuePanel from '@/components/QueuePanel';
import PlaybackSettings from '@/components/PlaybackSettings';
import {useLikes} from '@/contexts/LikesContext';
import {useToast} from '@/contexts/ToastContext';
import {audioShareUrl} from '@/lib/share';
import {useRybbit} from '@/hooks/useRybbit';
import {readLocalStorage, writeLocalStorage} from '@/lib/storage';
import ImmersiveErrorBoundary from './immersive/ImmersiveErrorBoundary';

const IMMERSIVE_DISCOVERED_KEY = 'audio-share:immersive-discovered';

const ImmersivePlayer = lazy(() => import('./immersive/ImmersivePlayer'));

function formatTime(time: number): string {
    const safe = Number.isFinite(time) ? time : 0;
    return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, '0')}`;
}

export default function AudioPlayer() {
    const [isMinimized, setIsMinimized] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [showQueue, setShowQueue] = useState(false);
    const [showImmersive, setShowImmersive] = useState(false);
    const [immersiveIsNew, setImmersiveIsNew] = useState(() => readLocalStorage(IMMERSIVE_DISCOVERED_KEY) !== 'true');
    const {track: trackEvent} = useRybbit();
    const queueButtonRef = useRef<HTMLButtonElement>(null);
    const queueId = useId();
    const [previewTime, setPreviewTime] = useState<number | null>(null);

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
        seekBy,
        seekTo,
        setVolume,
        enableAudioLevels,
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
        setShowImmersive(false);
        closePlayer();
    };

    const total = duration || metadata?.duration || 0;
    const position = previewTime ?? currentTime;
    const canSeek = audioLoaded && total > 0;

    useEffect(() => {
        setPreviewTime(null);
    }, [currentTrack?.id, canSeek]);

    if (!currentTrack) return null;

    const immersiveEntry = (
        <Button size="sm" variant={immersiveIsNew ? 'selected' : 'ghost'}
            type="button"
            onClick={() => {
                setShowQueue(false);
                setShowImmersive(true);
                enableAudioLevels?.();
                setImmersiveIsNew(false);
                writeLocalStorage(IMMERSIVE_DISCOVERED_KEY, 'true');
                trackEvent('immersive-player-open', {
                    entryPoint: 'expanded',
                    highlighted: immersiveIsNew,
                });
            }}
            className="min-h-9 shrink-0"
            aria-label="Open immersive player"
            aria-description={immersiveIsNew ? 'New: explore waveform landscapes while you listen' : undefined}
            title={immersiveIsNew ? 'New: explore immersive waveform scenes' : 'Open immersive player'}
        >
            <Mountain className="h-4 w-4" />
            {immersiveIsNew && <span className="text-[9px] font-semibold uppercase tracking-wide">New</span>}
        </Button>
    );

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
                        <IconButton variant="primary" size="md"
                            onClick={togglePlay}
                            aria-label={isPlaying ? "Pause" : "Play"}
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin"/>
                            ) : isPlaying ? (
                                <Pause className="h-4 w-4"/>
                            ) : (
                                <Play className="h-4 w-4"/>
                            )}
                        </IconButton>
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
                    <Button variant="subtle" size="sm"
                        type="button"
                        ref={queueButtonRef} aria-controls={showQueue ? queueId : undefined} onClick={() => setShowQueue(value => !value)}
                        className="shrink-0"
                        aria-expanded={showQueue}
                        aria-label={`Open queue, ${upcoming.length} ${upcoming.length === 1 ? 'track' : 'tracks'} upcoming`}
                        title="Open queue"
                    >
                        <ListMusic className="h-3.5 w-3.5" />
                        <span className="min-w-3 text-center text-[10px] font-medium tabular-nums text-[var(--foreground)]">{upcoming.length > 99 ? '99+' : upcoming.length}</span>
                    </Button>
                    <IconButton
                        type="button"
                        onClick={toggleMinimize}
                        aria-label="Expand player"
                        title="Expand player"
                    >
                        <Expand className="h-3.5 w-3.5"/>
                    </IconButton>
                </div>
            ) : (
                <>
                <div className="flex items-center justify-between p-2.5 border-b border-[var(--border)]">
                    <IconButton
                        onClick={() => void toggleLike(currentTrack.shareKey, currentTrack.source)}
                        disabled={!likesReady || likesLoading || likePending}
                        variant={liked ? 'selected' : 'ghost'}
                        aria-pressed={liked}
                        aria-label={liked ? 'Unlike track' : 'Like track'}
                        title={liked ? 'Unlike track' : 'Like track'}
                    >
                        <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                    </IconButton>
                    <div className="flex items-center gap-1">
                        {immersiveEntry}
                        <IconButton type="button" onClick={() => void copyShareLink()} aria-label="Copy share link" title="Copy share link">
                            <Share2 className="h-4 w-4" />
                        </IconButton>
                        <IconButton ref={queueButtonRef} aria-controls={showQueue ? queueId : undefined} onClick={() => setShowQueue(value => !value)} className="relative" aria-expanded={showQueue} aria-label="Open queue" title="Open queue">
                            <ListMusic className="h-4 w-4" />
                            {upcoming.length > 0 && <span className="absolute -right-1 -top-1 min-w-3 h-3 px-0.5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[8px] flex items-center justify-center">{Math.min(99, upcoming.length)}</span>}
                        </IconButton>
                        <IconButton onClick={toggleMinimize} aria-label="Minimize player" title="Minimize player"><MinusCircle className="h-4 w-4"/></IconButton>
                        <IconButton onClick={handleClosePlayer} variant="danger" aria-label="Close and clear queue" title="Close and clear queue"><X className="h-4 w-4"/></IconButton>
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
                                {isMature && <Badge size="sm" className="mt-0.5">18+</Badge>}
                            </div>
                            <div className="text-sm text-[var(--muted-foreground)] truncate">
                                {metadata?.artist || artist}
                            </div>
                        </div>
                    </div>

                    {error && (
                        <Alert size="sm" className="mb-3 flex items-center animate-fadeIn">
                            <Info className="mr-2 h-4 w-4 flex-shrink-0"/>
                            <span>{error}</span>
                        </Alert>
                    )}
                    {notice && (
                        <Alert variant="info" size="sm" className="mb-3 flex items-center animate-fadeIn">
                            <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0"/>
                            <span>{notice}</span>
                        </Alert>
                    )}

                    <div className="mb-3">
                        <div className="relative mb-2 flex h-8 items-center">
                            {waveformPeaks && <WaveformDisplay peaks={waveformPeaks} progress={position / (total || 1)} height={32} className="absolute inset-x-2" />}
                            <PlaybackSeek key={currentTrack.id} position={position} duration={total} disabled={!canSeek}
                                onPreview={setPreviewTime} onSeek={seekTo}
                                className={`relative w-full ${waveformPeaks ? 'slider-waveform' : ''}`} />
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                                {isPlaying || position > 0 ? formatTime(position) : "0:00"}
                            </span>

                            <div className="flex items-center gap-1">
                                <IconButton onClick={skipPrevious} aria-label="Previous track" title="Previous track"><SkipBack className="h-4 w-4 fill-current" /></IconButton>
                                <IconButton
                                    onClick={() => seekBy(-10)}
                                    className="relative"
                                    aria-label="Seek backward 10 seconds"
                                    title="Seek backward 10 seconds"
                                >
                                    <RotateCcw className="h-5 w-5" />
                                    <span className="absolute inset-0 flex items-center justify-center pt-0.5 text-[8px] font-bold" aria-hidden="true">10</span>
                                </IconButton>
                                <IconButton variant="primary" size="lg"
                                    onClick={togglePlay}
                                    aria-label={isPlaying ? "Pause" : "Play"}
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-6 w-6 animate-spin"/>
                                    ) : isPlaying ? (
                                        <Pause className="h-6 w-6"/>
                                    ) : (
                                        <Play className="h-6 w-6"/>
                                    )}
                                </IconButton>
                                <IconButton
                                    onClick={() => seekBy(30)}
                                    className="relative"
                                    aria-label="Seek forward 30 seconds"
                                    title="Seek forward 30 seconds"
                                >
                                    <RotateCw className="h-5 w-5" />
                                    <span className="absolute inset-0 flex items-center justify-center pt-0.5 text-[8px] font-bold" aria-hidden="true">30</span>
                                </IconButton>
                                <IconButton onClick={skipNext} aria-label="Next track" title="Next track"><SkipForward className="h-4 w-4 fill-current" /></IconButton>
                            </div>

                            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                                {formatTime(duration || (metadata?.duration || 0))}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                        <IconButton
                            onClick={toggleMute}
                            aria-label={isMuted ? "Unmute" : "Mute"}
                        >
                            {isMuted ? <VolumeX className="h-4 w-4"/> : <Volume2 className="h-4 w-4"/>}
                        </IconButton>

                        <Slider
                            min={0}
                            max={1}
                            step={0.01}
                            value={volume}
                            onChange={event => setVolume(Number.parseFloat(event.target.value))}
                            className="min-w-0 flex-1"
                            aria-label="Volume"
                        />
                        <PlaybackSettings />
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
        {showQueue && <QueuePanel id={queueId} triggerRef={queueButtonRef} onClose={() => setShowQueue(false)} />}
        {showImmersive && (
            <ImmersiveErrorBoundary onError={() => {
                setShowImmersive(false);
                toast.error('Immersive player could not be opened. Playback can continue here.');
            }}>
                <Suspense fallback={null}><ImmersivePlayer onClose={() => setShowImmersive(false)} /></Suspense>
            </ImmersiveErrorBoundary>
        )}
        </>
    );
}
