import {useState, useRef, useCallback, useEffect} from 'react';
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    AlertCircle,
    ChevronUp,
    ChevronDown,
    ExternalLink,
    Calendar,
    ChevronsDown,
    ChevronsUp,
    MinusCircle,
    Expand,
    Loader2
} from 'lucide-react';
import {useAudioPlayer} from '@/hooks/useAudioPlayer';

interface AudioPlayerProps {
    src: string;
    name?: string;
    onPlay?: () => void;
}

export default function AudioPlayer({src, onPlay}: AudioPlayerProps) {
    const [isExpanded, setIsExpanded] = useState(true);
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

    const toggleExpand = () => {
        setIsExpanded(!isExpanded);
        if (isMinimized && !isExpanded) {
            setIsMinimized(false);
        }
    };

    const toggleMinimize = () => {
        setIsMinimized(!isMinimized);
        if (!isMinimized && !isExpanded) {
            setIsExpanded(true);
        }
    };

    const toggleDescriptionExpand = () => {
        setIsDescriptionExpanded(!isDescriptionExpanded);
    };

    return (
        <div
            className={`fixed bottom-4 right-4 z-50 ${isMinimized ? 'w-16' : 'w-72'} bg-[var(--card)] rounded-lg shadow-lg border border-[var(--border)] overflow-hidden transition-all duration-300`}
        >
            <div className="flex justify-between items-center p-2.5 border-b border-[var(--border)]">
                {!isMinimized && (
                    <button
                        onClick={toggleExpand}
                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        aria-label={isExpanded ? "Collapse player" : "Expand player"}
                    >
                        {isExpanded ? <ChevronDown className="h-4 w-4"/> : <ChevronUp className="h-4 w-4"/>}
                    </button>
                )}

                <div className={`${isMinimized ? 'w-full text-center' : 'flex-grow text-center'} truncate px-2`}>
                    {!isMinimized && (
                        <div className="text-sm font-medium truncate">
                            {metadata?.title || track}
                        </div>
                    )}
                </div>

                {!isMinimized && (
                    <button
                        onClick={toggleMinimize}
                        className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        aria-label="Minimize player"
                    >
                        <MinusCircle className="h-4 w-4"/>
                    </button>
                )}

                {isMinimized && (
                    <button
                        onClick={toggleMinimize}
                        className="absolute top-1 right-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        aria-label="Expand player"
                    >
                        <Expand className="h-3 w-3"/>
                    </button>
                )}
            </div>

            {isMinimized && (
                <div className="p-2 flex justify-center">
                    <button
                        onClick={handlePlay}
                        className="p-2 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-50"
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
            )}

            {!isMinimized && (
                <div className="p-3">
                    <div className="flex flex-col mb-3">
                        {thumbnail && isExpanded && (
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
                        <div
                            ref={progressRef}
                            className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden cursor-pointer transition-height duration-200 hover:h-3 mb-2"
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

                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                                {isPlaying || currentTime > 0 ? formatTime(currentTime) : "0:00"}
                            </span>

                            <button
                                onClick={handlePlay}
                                className="p-3 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-50 mx-2"
                                aria-label={isPlaying ? "Pause" : "Play"}
                            >
                                {isLoading ? (
                                    <Loader2 className="h-5 w-5 animate-spin"/>
                                ) : isPlaying ? (
                                    <Pause className="h-5 w-5"/>
                                ) : (
                                    <Play className="h-5 w-5"/>
                                )}
                            </button>

                            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
                                {formatTime(duration || (metadata?.duration || 0))}
                            </span>
                        </div>
                    </div>

                    {isExpanded && (
                        <div className="flex items-center space-x-2 mb-2 transition-all duration-300 animate-fadeIn">
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
                                className="flex-grow accent-[var(--primary)] transition-all duration-200"
                                aria-label="Volume"
                            />
                        </div>
                    )}

                    {isExpanded && (
                        <div className="transition-all duration-300 animate-fadeIn">
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
                    )}
                </div>
            )}
        </div>
    );
}
