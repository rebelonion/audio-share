import {useState, useRef, useEffect, useCallback} from 'react';
import {useUmami} from './useUmami';
import {API_BASE} from '@/lib/api';

interface MetadataType {
    title: string;
    artist: string;
    uploadDate?: string;
    webpageUrl?: string;
    duration?: number;
    description?: string;
}

export function useAudioPlayer(src: string) {
    const {track: trackEvent} = useUmami();
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<MetadataType | null>(null);
    const [audioLoaded, setAudioLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const progressRef = useRef<HTMLDivElement>(null);

    const getDisplayName = useCallback((filename: string): { artist: string, track: string } => {
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
    }, []);

    const loadMetadata = useCallback(async (filePath: string, signal?: AbortSignal) => {
        try {
            const jsonPath = filePath.replace(/\.[^/.]+$/, ".info.json");
            const apiJsonPath = jsonPath.replace(/^\/audio\//, `${API_BASE}/api/audio/`);
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
    }, [getDisplayName]);

    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
            setIsLoading(false);
            setAudioLoaded(true);
        }
    }, []);

    const errorHandler = useCallback((e: Event) => {
        console.error('Audio element error:', e);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        const potentialThumbPath = src.replace(/\.[^/.]+$/, "-thumb.jpg");
        const apiThumbPath = potentialThumbPath.replace(/^\/audio\//, `${API_BASE}/api/audio/`);
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

    const togglePlay = useCallback(() => {
        if (isPlaying && audioRef.current) {
            try {
                audioRef.current.pause();
                setIsPlaying(false);
                trackEvent('audio-pause');
            } catch (err) {
                console.error('Error pausing audio:', err);
            }
        } else {
            if (error || !audioLoaded) {
                // Completely destroy old audio element
                if (audioRef.current) {
                    try {
                        audioRef.current.pause();
                        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
                        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
                        audioRef.current.removeEventListener('ended', () => setIsPlaying(false));
                        audioRef.current.src = '';
                        audioRef.current.load();
                    } catch (e) {
                        console.error('Error cleaning up audio:', e);
                    }
                }
                audioRef.current = null;

                setIsLoading(true);
                setError(null);
                setAudioLoaded(false);

                const apiAudioPath = src.replace(/^\/audio\//, `${API_BASE}/api/audio/`);
                const newAudio = new Audio(apiAudioPath);

                newAudio.addEventListener('timeupdate', handleTimeUpdate);
                newAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
                newAudio.addEventListener('ended', () => setIsPlaying(false));

                const handleError = () => {
                    setIsLoading(false);
                    setIsPlaying(false);
                    setAudioLoaded(false);

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
                newAudio.preload = 'none';
                audioRef.current = newAudio;

                const playPromise = newAudio.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            setIsPlaying(true);
                            setIsLoading(false);
                            setError(null);
                            trackEvent('audio-play');
                        })
                        .catch(async (err) => {
                            setIsPlaying(false);
                            setAudioLoaded(false);
                            setIsLoading(false);

                            // Check the actual HTTP status to provide accurate error message
                            try {
                                const response = await fetch(apiAudioPath, {method: 'HEAD'});
                                if (response.status === 429) {
                                    setError('Rate limit exceeded. Please try again later.');
                                } else if (response.status >= 500) {
                                    setError('Server error while loading audio. Please try again later.');
                                } else if (response.status >= 400) {
                                    setError('Could not load audio file. The file may not exist or is in an unsupported format.');
                                } else if (err.name === 'NotAllowedError') {
                                    setError('Playback was blocked by browser policy. Try interacting with the page first.');
                                } else if (err.name === 'NotSupportedError') {
                                    setError('This audio format is not supported by your browser.');
                                } else {
                                    setError('Could not play audio file. Please try again.');
                                }
                            } catch {
                                setError('Network error while loading audio. Please check your connection.');
                            }
                        });
                } else {
                    setIsPlaying(true);
                    setIsLoading(false);
                    setError(null);
                }
            } else if (audioRef.current) {
                // Audio is already loaded, just play it
                const playPromise = audioRef.current.play();
                setIsLoading(true);
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            setIsPlaying(true);
                            setIsLoading(false);
                            setError(null);
                            trackEvent('audio-play');
                        })
                        .catch(async (err) => {
                            setIsPlaying(false);
                            setAudioLoaded(false);
                            setIsLoading(false);

                            if (err.name === 'NotAllowedError') {
                                setError('Playback was blocked by browser policy. Try interacting with the page first.');
                            } else if (err.name === 'NotSupportedError') {
                                setError('This audio format is not supported by your browser.');
                            } else {
                                try {
                                    const apiAudioPath = src.replace(/^\/audio\//, `${API_BASE}/api/audio/`);
                                    const response = await fetch(apiAudioPath, {method: 'HEAD'});
                                    if (response.status === 429) {
                                        setError('Rate limit exceeded. Please try again later.');
                                    } else {
                                        setError('Could not play audio. Please try again.');
                                    }
                                } catch {
                                    setError('Could not play audio. Please try again.');
                                }
                            }
                        });
                } else {
                    setIsPlaying(true);
                    setIsLoading(false);
                    setError(null);
                }
            }
        }
    }, [isPlaying, audioLoaded, error, src, volume, isMuted, handleTimeUpdate, handleLoadedMetadata, trackEvent]);

    const toggleMute = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
            trackEvent('audio-mute', { muted: !isMuted });
        }
    }, [isMuted, trackEvent]);

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
    }, [isMuted]);

    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (audioRef.current && progressRef.current) {
            const bounds = progressRef.current.getBoundingClientRect();
            const x = e.clientX - bounds.left;
            const ratio = x / bounds.width;
            const seekTime = ratio * (duration || 0);

            if (seekTime >= 0 && seekTime <= duration) {
                audioRef.current.currentTime = seekTime;
                setCurrentTime(seekTime);
                trackEvent('audio-seek');
            }
        }
    }, [duration, trackEvent]);

    const formatTime = useCallback((time: number) => {
        if (!time && !audioLoaded && metadata?.duration) {
            time = metadata.duration;
        }

        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }, [audioLoaded, metadata?.duration]);

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

    const {artist, track} = getDisplayName(src);

    return {
        // State
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

        // Refs
        progressRef,

        // Handlers
        togglePlay,
        toggleMute,
        handleVolumeChange,
        handleProgressClick,
        formatTime
    };
}
