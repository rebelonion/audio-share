import React, {useState, useRef, useEffect, useCallback} from 'react';
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
import NextImage from 'next/image';

interface AudioPlayerProps {
    src: string;
    name?: string;
}

interface MetadataType {
    title: string;
    artist: string;
    uploadDate?: string;
    webpageUrl?: string;
    duration?: number;
    description?: string;
}

export default function AudioPlayer({src}: AudioPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<MetadataType | null>(null);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [audioLoaded, setAudioLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const progressRef = useRef<HTMLDivElement>(null);

    const getDisplayName = (filename: string): { artist: string, track: string } => {
        const decodedFilename = decodeURIComponent(filename);
        const parts = decodedFilename.split('/');

        if (parts.length >= 2) {
            const artist = parts[parts.length - 2];
            const track = parts[parts.length - 1].replace(/\.[^/.]+$/, "");
            return {artist, track};
        }

        return {
            artist: 'Unknown Artist',
            track: decodedFilename.replace(/\.[^/.]+$/, "")
        };
    };

    const loadMetadata = useCallback(async (filePath: string, signal?: AbortSignal) => {
        try {
            const jsonPath = filePath.replace(/\.[^/.]+$/, ".info.json");
            const apiJsonPath = jsonPath.replace(/^\/audio\//, '/api/audio/');
            const response = await fetch(apiJsonPath, { signal });

            if (response.ok) {
                const data = await response.json();
                if (signal && signal.aborted) return;
                
                setMetadata({
                    title: data.title || data.fulltitle || '',
                    artist: data.meta_artist || data.uploader || data.channel || '',
                    uploadDate: data.upload_date || '',
                    webpageUrl: data.webpage_url || '',
                    description: data.description || '',
                    duration: data.duration
                });
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw error;
            }
            if (signal && signal.aborted) return;
            
            const {artist, track} = getDisplayName(filePath);
            setMetadata({
                title: track,
                artist: artist
            });
        }
    }, []);

    const {artist, track} = getDisplayName(src);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        
        const potentialThumbPath = src.replace(/\.[^/.]+$/, "-thumb.jpg");
        const apiThumbPath = potentialThumbPath.replace(/^\/audio\//, '/api/audio/');
        setThumbnail(null);
        setMetadata(null);

        fetch(apiThumbPath, {
            method: 'HEAD',
            signal: controller.signal
        })
        .then(response => {
            if (!signal.aborted && response.ok) {
                setThumbnail(apiThumbPath);
            } else if (!signal.aborted) {
                setThumbnail(null);
            }
        })
        .catch(error => {
            if (!signal.aborted && error.name !== 'AbortError') {
                console.error('Error checking thumbnail:', error);
                setThumbnail(null);
            }
        });
        loadMetadata(src, signal).catch(err => {
            if (err.name !== 'AbortError') {
                console.error('Error loading metadata:', err);
            }
        });

        return () => {
            controller.abort();
        };
    }, [src, loadMetadata]);

    const togglePlay = () => {
        if (isPlaying && audioRef.current) {
            try {
                audioRef.current.pause();
                setIsPlaying(false);
            } catch (err) {
                console.error('Error pausing audio:', err);
            }
        } else {
            if (!audioLoaded) {
                setIsLoading(true);
                setError(null);
                
                try {
                    const apiAudioPath = src.replace(/^\/audio\//, '/api/audio/');
                    const newAudio = new Audio(apiAudioPath);

                    newAudio.addEventListener('timeupdate', handleTimeUpdate);
                    
                    newAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
                    
                    newAudio.addEventListener('ended', () => setIsPlaying(false));

                    const handleError = (e: Event) => {
                        setIsLoading(false);
                        console.warn('Audio element error:', e);
                        
                        // Only show error if this is the current audio element
                        if (audioRef.current === newAudio) {
                            fetch(apiAudioPath, {method: 'HEAD'})
                                .then(response => {
                                    if (response.status === 429) {
                                        setError('Rate limit exceeded. Please try again later.');
                                    } else if (response.status >= 500) {
                                        setError('Server error while loading audio. Please try again later.');
                                    } else if (response.status >= 400) {
                                        setError('Could not load audio file. The file may not exist or is in an unsupported format.');
                                    } else {
                                        setError('Error playing audio. The connection may have been interrupted.');
                                    }
                                })
                                .catch(() => {
                                    setError('Network error while loading audio. Please check your connection.');
                                });
                        }
                    };
                    
                    newAudio.addEventListener('error', handleError);

                    newAudio.volume = volume;
                    newAudio.muted = isMuted;
                    newAudio.preload = 'auto';
                    audioRef.current = newAudio;
                    setAudioLoaded(true);
                } catch (initErr) {
                    console.error('Error initializing audio:', initErr);
                    setError('Failed to initialize audio player. Please try again.');
                    setIsLoading(false);
                    return;
                }
            }

            if (audioRef.current) {
                try {
                    const playPromise = audioRef.current.play();
                    setIsLoading(true);
                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => {
                                setIsPlaying(true);
                                setIsLoading(false);
                            })
                            .catch(err => {
                                console.error('Error playing audio:', err);
                                if (audioRef.current) {
                                    if (err.name === 'AbortError') {
                                        setError('Playback was aborted. Please try again.');
                                    } else if (err.name === 'NotAllowedError') {
                                        setError('Playback was blocked by browser policy. Try interacting with the page first.');
                                    } else if (err.name === 'NotSupportedError') {
                                        setError('This audio format is not supported by your browser.');
                                    } else {
                                        setError('Could not play audio file. The file may not exist or is in an unsupported format.');
                                    }
                                    
                                    setIsPlaying(false);
                                }
                                setIsLoading(false);
                            });
                    } else {
                        // Older browsers don't return a promise
                        setIsPlaying(true);
                        setIsLoading(false);
                    }
                } catch (playErr) {
                    console.error('Unexpected error during play:', playErr);
                    setError('An unexpected error occurred while playing audio.');
                    setIsPlaying(false);
                    setIsLoading(false);
                }
            }
        }
    };

    const toggleMute = () => {
        if (audioRef.current) {
            audioRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
            setIsLoading(false);
        }
    }, []);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (audioRef.current) {
            audioRef.current.volume = newVolume;
        }
        if (newVolume === 0) {
            setIsMuted(true);
        } else if (isMuted) {
            setIsMuted(false);
        }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (audioRef.current && progressRef.current) {
            const bounds = progressRef.current.getBoundingClientRect();
            const x = e.clientX - bounds.left;
            const ratio = x / bounds.width;
            const seekTime = ratio * (duration || 0);

            if (seekTime >= 0 && seekTime <= duration) {
                audioRef.current.currentTime = seekTime;
                setCurrentTime(seekTime);
            }
        }
    };

    const formatTime = (time: number) => {
        if (!time && !audioLoaded && metadata?.duration) {
            time = metadata.duration;
        }

        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

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

    const errorHandler = useCallback((e: Event) => {
        console.error('Audio element error:', e);
    }, []);

    useEffect(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setAudioLoaded(false);
        setError(null);
        setIsLoading(false);

        const audioElement = audioRef.current;
        if (audioElement) {
            try {
                audioElement.pause();
                audioElement.removeEventListener('timeupdate', handleTimeUpdate);
                audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
                audioElement.removeEventListener('ended', () => setIsPlaying(false));
                audioElement.removeEventListener('error', errorHandler);
                audioElement.src = '';
                audioElement.load();
            } catch (e) {
                console.error('Error cleaning up audio element:', e);
            }
            audioRef.current = null;
        }

        return () => {
            const audio = audioRef.current;
            if (audio) {
                try {
                    audio.pause();
                    audio.removeEventListener('timeupdate', handleTimeUpdate);
                    audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
                    audio.removeEventListener('ended', () => setIsPlaying(false));
                    audio.removeEventListener('error', errorHandler);

                    audio.src = '';
                    audio.load();
                } catch (e) {
                    console.error('Error during cleanup on unmount:', e);
                }
            }
        };
    }, [src, handleTimeUpdate, errorHandler, handleLoadedMetadata]);

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
                        onClick={togglePlay}
                        className="p-2 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-50"
                        disabled={!!error}
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
                                <NextImage
                                    src={thumbnail}
                                    alt={`${metadata?.title || track} thumbnail`}
                                    width={192}
                                    height={192}
                                    quality={75}
                                    priority={false}
                                    loading="lazy"
                                    className="object-cover rounded-md shadow-sm w-full h-auto max-h-48"
                                    onError={() => setThumbnail(null)}
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
                                onClick={togglePlay}
                                className="p-3 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-50 mx-2"
                                disabled={!!error}
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
                                disabled={!!error}
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
                                disabled={!!error}
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