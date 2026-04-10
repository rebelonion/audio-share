import {useState, useRef, useCallback, useEffect} from 'react';
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    AlertCircle,
    ExternalLink,
    Calendar,
    ChevronsDown,
    ChevronsUp,
    MinusCircle,
    Expand,
    Loader2
} from 'lucide-react';
import {useAudioPlayer} from '@/hooks/useAudioPlayer';
import WaveformDisplay from '@/components/WaveformDisplay';

interface AudioPlayerProps {
    src: string;
    name?: string;
    onPlay?: () => void;
}

export default function AudioPlayer({src, onPlay}: AudioPlayerProps) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const hasTracked = useRef(false);

    useEffect(() => {
        hasTracked.current = false;
    }, [src]);

    const {
        isPlaying,
        duration,
        currentTime,
        volume,
        isMuted,
        error,
        thumbnail,
        metadata,
        audioLoaded,
        isLoading,
        artist,
        track,
        waveformPeaks,
        progressRef,
        togglePlay,
        toggleMute,
        handleVolumeChange,
        handleProgressClick,
        formatTime
    } = useAudioPlayer(src);

    const handlePlay = useCallback(() => {
        if (!isPlaying && onPlay && !hasTracked.current) {
            hasTracked.current = true;
            onPlay();
        }
        togglePlay();
    }, [isPlaying, onPlay, togglePlay]);

    const toggleMinimize = () => {
        setIsMinimized(!isMinimized);
    };

    const toggleDescriptionExpand = () => {
        setIsDescriptionExpanded(!isDescriptionExpanded);
    };

    return (
        <div
            className={`fixed bottom-4 right-4 z-50 ${isMinimized ? 'w-52' : 'w-80'} rounded-lg overflow-hidden transition-all duration-300`}
            style={{
                background: 'rgba(19, 17, 9, 0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: isPlaying ? 'rgba(196,136,42,0.4)' : 'var(--border)',
                boxShadow: isPlaying
                    ? '0 20px 60px rgba(0,0,0,0.55), 0 0 40px rgba(196,136,42,0.07)'
                    : '0 20px 50px rgba(0,0,0,0.45)',
            }}
        >
            {isMinimized ? (
                <div className="flex items-center gap-2 px-2 py-2">
                    <div className="relative flex-shrink-0">
                        {isPlaying && (
                            <span className="absolute inset-0 rounded-full bg-[var(--primary)] animate-ping opacity-20 pointer-events-none" />
                        )}
                        <button
                            onClick={handlePlay}
                            className="relative p-2 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all duration-200 focus:outline-none"
                            style={{
                                boxShadow: isPlaying ? '0 0 0 3px rgba(196,136,42,0.25), 0 0 18px rgba(196,136,42,0.3)' : undefined,
                            }}
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
                    <div className="flex-1 min-w-0 text-xs text-[var(--foreground)] truncate leading-tight">
                        {metadata?.title || track}
                    </div>
                    <button
                        onClick={toggleMinimize}
                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
                        aria-label="Expand player"
                    >
                        <Expand className="h-3.5 w-3.5"/>
                    </button>
                </div>
            ) : (
                <>
                <div className="flex items-center justify-between p-2.5 border-b border-[var(--border)]">
                    <div className="flex-grow text-center truncate px-2">
                        <div className="text-sm font-medium truncate">
                            {metadata?.title || track}
                        </div>
                    </div>
                    <button
                        onClick={toggleMinimize}
                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
                        aria-label="Minimize player"
                    >
                        <MinusCircle className="h-4 w-4"/>
                    </button>
                </div>

                <div className="p-3">
                    <div className="flex flex-col mb-3">
                        {thumbnail && (
                            <div className="mx-auto mb-3 transition-all duration-300 transform hover:scale-105">
                                <img
                                    src={thumbnail}
                                    alt={`${metadata?.title || track} thumbnail`}
                                    width={192}
                                    height={192}
                                    loading="lazy"
                                    className="object-cover rounded-md shadow-sm w-full h-auto max-h-48"
                                />
                            </div>
                        )}

                        <div className="text-center">
                            <div className="font-medium text-[var(--foreground)] line-clamp-3">
                                {metadata?.title || track}
                            </div>
                            <div className="text-sm text-[var(--muted-foreground)] truncate">
                                {metadata?.artist || artist}
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-3 p-2 bg-red-900/20 text-red-400 rounded flex items-start animate-fadeIn">
                            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5"/>
                            <span className="text-xs">{error}</span>
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
                                className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden cursor-pointer transition-height duration-200 hover:h-3 mb-2"
                                onClick={handleProgressClick}
                            >
                                <div
                                    className="h-full bg-[var(--primary)] rounded-full transition-all duration-100"
                                    style={{
                                        width: `${(currentTime / (duration || (metadata?.duration || 1))) * 100 || 0}%`,
                                        opacity: audioLoaded ? 1 : 0.7
                                    }}
                                ></div>
                            </div>
                        )}

                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                                {isPlaying || currentTime > 0 ? formatTime(currentTime) : "0:00"}
                            </span>

                            <button
                                onClick={handlePlay}
                                className="p-3 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all duration-300 mx-2 focus:outline-none"
                                style={{
                                    boxShadow: isPlaying
                                        ? '0 0 0 3px rgba(196,136,42,0.25), 0 0 24px rgba(196,136,42,0.4)'
                                        : '0 0 0 0 rgba(196,136,42,0)',
                                }}
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
                            onChange={handleVolumeChange}
                            className="flex-grow transition-all duration-200"
                            aria-label="Volume"
                        />
                    </div>

                    <div>
                        {metadata?.uploadDate && (
                            <div className="text-xs text-[var(--muted-foreground)] flex items-center mt-2">
                                <Calendar className="h-3 w-3 mr-1"/>
                                <span>{`${metadata.uploadDate.substring(0, 4)}-${metadata.uploadDate.substring(4, 6)}-${metadata.uploadDate.substring(6, 8)}`}</span>
                            </div>
                        )}

                        {metadata?.webpageUrl && (
                            <div className="text-xs text-[var(--muted-foreground)] flex items-center mt-2">
                                <a
                                    href={metadata.webpageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center hover:text-[var(--primary)] transition-colors"
                                >
                                    <ExternalLink className="h-3 w-3 mr-1"/>
                                    <span className="truncate">Original Source</span>
                                </a>
                            </div>
                        )}

                        {metadata?.description && (
                            <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="font-medium text-xs">Description</div>
                                    <button
                                        onClick={toggleDescriptionExpand}
                                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                        aria-label={isDescriptionExpanded ? "Collapse description" : "Expand description"}
                                    >
                                        {isDescriptionExpanded ? <ChevronsUp className="h-3 w-3"/> :
                                            <ChevronsDown className="h-3 w-3"/>}
                                    </button>
                                </div>
                                <div
                                    className={`${isDescriptionExpanded ? 'max-h-40 overflow-y-auto custom-scrollbar' : 'line-clamp-2'} whitespace-pre-line rounded bg-[var(--card-hover)]/20 p-2`}
                                    onClick={isDescriptionExpanded ? undefined : toggleDescriptionExpand}
                                >
                                    {metadata.description}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </>
            )}
        </div>
    );
}
