import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import {API_BASE} from '@/lib/api';
import {useRybbit} from '@/hooks/useRybbit';

interface MetadataType {
    title: string;
    artist: string;
    uploadDate?: string;
    webpageUrl?: string;
    duration?: number;
    description?: string;
    ageLimit?: number;
    isMature?: boolean;
    showMature?: boolean;
}

export interface AudioPlayerTrack {
    src: string;
    shareKey?: string;
    name?: string;
    unavailable?: boolean;
    source?: 'browse' | 'share';
    onFirstPlay?: () => void;
}

type PlayerSurface = 'floating' | 'inline';

interface AudioPlayerContextValue {
    currentTrack: AudioPlayerTrack | null;
    surface: PlayerSurface;
    isPlaying: boolean;
    duration: number;
    currentTime: number;
    volume: number;
    isMuted: boolean;
    error: string | null;
    thumbnail: string | null;
    metadata: MetadataType | null;
    audioLoaded: boolean;
    isLoading: boolean;
    artist: string;
    track: string;
    waveformPeaks: Uint8Array | null;
    selectTrack: (track: AudioPlayerTrack) => void;
    closePlayer: () => void;
    setSurface: (surface: PlayerSurface) => void;
    togglePlay: () => void;
    toggleMute: () => void;
    seekBy: (seconds: number) => void;
    seekTo: (seconds: number) => void;
    adjustVolume: (delta: number) => void;
    handleVolumeChange: (event: ChangeEvent<HTMLInputElement>) => void;
    handleProgressClick: (event: MouseEvent<HTMLDivElement>) => void;
    formatTime: (time: number) => string;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

function getKey(src: string): string {
    return src.replace(/^\/audio\/key\//, '');
}

function getDisplayName(src: string, name?: string): { artist: string; track: string } {
    return {artist: '', track: name || getKey(src)};
}

export function AudioPlayerProvider({children}: { children: ReactNode }) {
    const {track: trackEvent} = useRybbit();
    const [currentTrack, setCurrentTrack] = useState<AudioPlayerTrack | null>(null);
    const [surface, setSurface] = useState<PlayerSurface>('floating');
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
    const [waveformPeaks, setWaveformPeaks] = useState<Uint8Array | null>(null);
    const [maturePreferenceVersion, setMaturePreferenceVersion] = useState(0);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentTrackRef = useRef<AudioPlayerTrack | null>(null);
    const recordedPlaySrcRef = useRef<string | null>(null);

    useEffect(() => {
        currentTrackRef.current = currentTrack;
    }, [currentTrack]);

    const resetPlaybackState = useCallback(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setAudioLoaded(false);
        setError(null);
        setIsLoading(false);
    }, []);

    const destroyAudio = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.pause();
        audio.src = '';
        audio.load();
        audioRef.current = null;
    }, []);

    const selectTrack = useCallback((track: AudioPlayerTrack) => {
        const existing = currentTrackRef.current;
        if (existing?.src === track.src) {
            const nextTrack = {...existing, ...track};
            currentTrackRef.current = nextTrack;
            setCurrentTrack(nextTrack);
            return;
        }

        destroyAudio();
        resetPlaybackState();
        setThumbnail(null);
        setMetadata(null);
        setWaveformPeaks(null);
        recordedPlaySrcRef.current = null;
        currentTrackRef.current = track;
        setCurrentTrack(track);
    }, [destroyAudio, resetPlaybackState]);

    const closePlayer = useCallback(() => {
        destroyAudio();
        resetPlaybackState();
        currentTrackRef.current = null;
        setCurrentTrack(null);
        setThumbnail(null);
        setMetadata(null);
        setWaveformPeaks(null);
        setSurface('floating');
        recordedPlaySrcRef.current = null;
    }, [destroyAudio, resetPlaybackState]);

    useEffect(() => {
        const listener = () => setMaturePreferenceVersion((version) => version + 1);
        window.addEventListener('audio-share:mature-preference', listener);
        return () => window.removeEventListener('audio-share:mature-preference', listener);
    }, []);

    useEffect(() => {
        const src = currentTrack?.src;
        if (!src) return;

        const controller = new AbortController();
        const signal = controller.signal;
        const key = getKey(src);

        setThumbnail(null);
        setMetadata(null);
        setWaveformPeaks(null);
        setDuration(0);

        fetch(`${API_BASE}/api/audio/key/${key}/waveform`, {signal})
            .then(response => response.status === 200 ? response.json() : null)
            .then(data => {
                if (signal.aborted) return;
                if (data?.peaks) {
                    setWaveformPeaks(Uint8Array.from(atob(data.peaks), c => c.charCodeAt(0)));
                }
                if (data?.duration) {
                    setDuration(data.duration);
                }
            })
            .catch(() => {});

        fetch(`${API_BASE}/api/audio/key/${key}/meta`, {signal, credentials: 'include'})
            .then(response => response.ok ? response.json() : null)
            .then(data => {
                if (signal.aborted) return null;

                const loadedMetadata: MetadataType | null = data ? {
                    title: data.title || '',
                    artist: data.artist || '',
                    uploadDate: data.uploadDate || '',
                    webpageUrl: data.webpageUrl || '',
                    description: data.description || '',
                    ageLimit: data.ageLimit,
                    isMature: !!data.isMature,
                    showMature: !!data.showMature,
                } : {
                    title: currentTrack.name || key,
                    artist: '',
                };

                setMetadata(loadedMetadata);
                return loadedMetadata;
            })
            .then((loadedMetadata) => {
                if (signal.aborted || !loadedMetadata) return;

                const view = loadedMetadata.isMature && !loadedMetadata.showMature ? 'blurred' : 'original';
                const apiThumbUrl = `${API_BASE}/api/audio/key/${key}/thumbnail?view=${view}`;
                return fetch(apiThumbUrl, {
                    method: 'HEAD',
                    credentials: 'include',
                    signal,
                }).then(response => {
                    if (!signal.aborted && response.ok) {
                        setThumbnail(apiThumbUrl);
                    } else if (!signal.aborted) {
                        setThumbnail(null);
                    }
                }).catch(error => {
                    if (!signal.aborted && error.name !== 'AbortError') {
                        setThumbnail(null);
                    }
                });
            })
            .catch(error => {
                if (!signal.aborted && error.name !== 'AbortError') {
                    const fallbackMetadata = {
                        title: currentTrack.name || key,
                        artist: '',
                    };
                    setMetadata(fallbackMetadata);
                    setThumbnail(null);
                }
            });

        return () => controller.abort();
    }, [currentTrack?.src, currentTrack?.name, maturePreferenceVersion]);

    const togglePlay = useCallback(() => {
        const selectedTrack = currentTrackRef.current;
        if (!selectedTrack) return;

        const existingAudio = audioRef.current;
        if (isPlaying && existingAudio) {
            existingAudio.pause();
            setIsPlaying(false);
            trackEvent('audio-pause');
            return;
        }

        const playAudio = (audio: HTMLAudioElement) => {
            setIsLoading(true);
            const playPromise = audio.play();
            if (playPromise === undefined) {
                setIsPlaying(true);
                setIsLoading(false);
                setError(null);
                return;
            }

            playPromise
                .then(() => {
                    const latestTrack = currentTrackRef.current;
                    if (audioRef.current !== audio || latestTrack?.src !== selectedTrack.src) {
                        return;
                    }
                    setIsPlaying(true);
                    setIsLoading(false);
                    setError(null);
                    if (latestTrack && recordedPlaySrcRef.current !== latestTrack.src) {
                        recordedPlaySrcRef.current = latestTrack.src;
                        latestTrack.onFirstPlay?.();
                    }
                    trackEvent('audio-play', {title: metadata?.title || selectedTrack.src});
                })
                .catch(async (err) => {
                    if (audioRef.current !== audio || currentTrackRef.current?.src !== selectedTrack.src) {
                        return;
                    }
                    setIsPlaying(false);
                    setAudioLoaded(false);
                    setIsLoading(false);

                    if (err.name === 'NotAllowedError') {
                        setError('Playback was blocked by browser policy. Try interacting with the page first.');
                    } else if (err.name === 'NotSupportedError') {
                        setError('This audio format is not supported by your browser.');
                    } else {
                        try {
                            const response = await fetch(selectedTrack.src.replace(/^\/audio\/key\//, `${API_BASE}/api/audio/key/`), {method: 'HEAD'});
                            if (response.status === 429) {
                                setError('Rate limit exceeded. Please try again later.');
                            } else if (response.status >= 500) {
                                setError('Server error while loading audio. Please try again later.');
                            } else if (response.status >= 400) {
                                setError('Could not load audio file. The file may not exist or is in an unsupported format.');
                            } else {
                                setError('Could not play audio file. Please try again.');
                            }
                        } catch {
                            setError('Network error while loading audio. Please check your connection.');
                        }
                    }
                });
        };

        if (existingAudio && audioLoaded && !error) {
            playAudio(existingAudio);
            return;
        }

        destroyAudio();
        setIsLoading(true);
        setError(null);
        setAudioLoaded(false);

        const apiAudioPath = selectedTrack.src.replace(/^\/audio\/key\//, `${API_BASE}/api/audio/key/`);
        const newAudio = new Audio(apiAudioPath);

        newAudio.addEventListener('timeupdate', () => {
            if (audioRef.current !== newAudio) return;
            setCurrentTime(newAudio.currentTime);
        });
        newAudio.addEventListener('play', () => {
            if (audioRef.current !== newAudio) return;
            setIsPlaying(true);
        });
        newAudio.addEventListener('pause', () => {
            if (audioRef.current !== newAudio) return;
            setIsPlaying(false);
        });
        newAudio.addEventListener('loadedmetadata', () => {
            if (audioRef.current !== newAudio) return;
            setDuration(newAudio.duration);
            setIsLoading(false);
            setAudioLoaded(true);
        });
        newAudio.addEventListener('ended', () => {
            if (audioRef.current !== newAudio) return;
            setIsPlaying(false);
        });
        newAudio.addEventListener('error', () => {
            if (audioRef.current !== newAudio) return;
            setIsLoading(false);
            setIsPlaying(false);
            setAudioLoaded(false);

            fetch(apiAudioPath, {method: 'HEAD'})
                .then(response => {
                    if (audioRef.current !== newAudio) return;
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
                    if (audioRef.current === newAudio) {
                        setError('Network error while loading audio. Please check your connection.');
                    }
                });
        });

        newAudio.volume = volume;
        newAudio.muted = isMuted;
        newAudio.preload = 'none';
        audioRef.current = newAudio;
        playAudio(newAudio);
    }, [audioLoaded, destroyAudio, error, isMuted, isPlaying, metadata?.title, trackEvent, volume]);

    const toggleMute = useCallback(() => {
        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        if (audioRef.current) {
            audioRef.current.muted = nextMuted;
        }
        trackEvent('audio-mute', {muted: nextMuted});
    }, [isMuted, trackEvent]);

    const setPlayerVolume = useCallback((newVolume: number) => {
        const clampedVolume = Math.min(1, Math.max(0, newVolume));
        const nextMuted = clampedVolume === 0;

        setVolume(clampedVolume);
        setIsMuted(nextMuted);
        if (audioRef.current) {
            audioRef.current.volume = clampedVolume;
            audioRef.current.muted = nextMuted;
        }
    }, []);

    const handleVolumeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        setPlayerVolume(parseFloat(event.target.value));
    }, [setPlayerVolume]);

    const seekTo = useCallback((seconds: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        const activeDuration = duration || metadata?.duration || audio.duration || 0;
        if (!activeDuration) return;

        const seekTime = Math.min(activeDuration, Math.max(0, seconds));
        audio.currentTime = seekTime;
        setCurrentTime(seekTime);
    }, [duration, metadata?.duration]);

    const seekBy = useCallback((seconds: number) => {
        seekTo(currentTime + seconds);
    }, [currentTime, seekTo]);

    const adjustVolume = useCallback((delta: number) => {
        setPlayerVolume(volume + delta);
    }, [setPlayerVolume, volume]);

    const handleProgressClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - bounds.left) / bounds.width;
        const seekTime = ratio * (duration || 0);

        if (seekTime >= 0 && seekTime <= duration) {
            seekTo(seekTime);
        }
    }, [duration, seekTo]);

    const formatTime = useCallback((time: number) => {
        let displayTime = time;
        if (!displayTime && !audioLoaded && metadata?.duration) {
            displayTime = metadata.duration;
        }

        const minutes = Math.floor(displayTime / 60);
        const seconds = Math.floor(displayTime % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }, [audioLoaded, metadata?.duration]);

    const displayName = currentTrack ? getDisplayName(currentTrack.src, currentTrack.name) : {artist: '', track: ''};

    const value = useMemo<AudioPlayerContextValue>(() => ({
        currentTrack,
        surface,
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
        artist: displayName.artist,
        track: displayName.track,
        waveformPeaks,
        selectTrack,
        closePlayer,
        setSurface,
        togglePlay,
        toggleMute,
        seekBy,
        seekTo,
        adjustVolume,
        handleVolumeChange,
        handleProgressClick,
        formatTime,
    }), [
        currentTrack,
        surface,
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
        displayName.artist,
        displayName.track,
        waveformPeaks,
        selectTrack,
        closePlayer,
        togglePlay,
        toggleMute,
        seekBy,
        seekTo,
        adjustVolume,
        handleVolumeChange,
        handleProgressClick,
        formatTime,
    ]);

    return (
        <AudioPlayerContext.Provider value={value}>
            {children}
        </AudioPlayerContext.Provider>
    );
}

export function useGlobalAudioPlayer() {
    const value = useContext(AudioPlayerContext);
    if (!value) {
        throw new Error('useGlobalAudioPlayer must be used within AudioPlayerProvider');
    }
    return value;
}
