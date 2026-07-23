import {useCallback, useEffect, useRef, useState, type MutableRefObject} from 'react';
import {API_BASE, recordPlayEvent} from '@/lib/api';
import {useRybbit} from '@/hooks/useRybbit';
import type {PlayerMetadata} from '@/hooks/usePlayerMetadata';
import type {PlayerTrack} from '@/lib/playerQueue';
import {readLocalStorage, writeLocalStorage} from '@/lib/storage';

export const POSITION_STORAGE_KEY = 'audio-share:position';
const VOLUME_STORAGE_KEY = 'audio-share:volume';

function initialVolume(): number {
    const value = Number.parseFloat(readLocalStorage(VOLUME_STORAGE_KEY) || '1');
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

interface AudioEngineOptions {
    currentTrackRef: MutableRefObject<PlayerTrack | null>;
    metadataRef: MutableRefObject<PlayerMetadata | null>;
    onEndedRef: MutableRefObject<() => void>;
    waveformDuration: number;
}

export function useAudioEngine({
    currentTrackRef,
    metadataRef,
    onEndedRef,
    waveformDuration,
}: AudioEngineOptions) {
    const {track: trackEvent} = useRybbit();
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [volume, setVolume] = useState(initialVolume);
    const [isMuted, setIsMuted] = useState(() => volume === 0);
    const [error, setError] = useState<string | null>(null);
    const [audioLoaded, setAudioLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const resumableTrackRef = useRef(currentTrackRef.current?.shareKey || null);
    const recordedPlaySrcRef = useRef<string | null>(null);
    const persistedPositionRef = useRef(0);
    const playbackAttemptRef = useRef(0);

    useEffect(() => {
        if (waveformDuration > 0) setDuration(waveformDuration);
    }, [waveformDuration]);

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
        audioRef.current = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
    }, []);

    useEffect(() => () => destroyAudio(), [destroyAudio]);

    const resetForTrack = useCallback(() => {
        destroyAudio();
        resetPlaybackState();
        resumableTrackRef.current = null;
        recordedPlaySrcRef.current = null;
        persistedPositionRef.current = 0;
        playbackAttemptRef.current += 1;
    }, [destroyAudio, resetPlaybackState]);

    const applyLoadedAudioMetadata = useCallback((audio: HTMLAudioElement, loadedTrack: PlayerTrack) => {
        if (audioRef.current !== audio || currentTrackRef.current?.id !== loadedTrack.id) return;

        setDuration(audio.duration);
        setIsLoading(false);
        setAudioLoaded(true);
        try {
            const saved = JSON.parse(readLocalStorage(POSITION_STORAGE_KEY) || '{}') as {
                shareKey?: string;
                time?: number;
            };
            if (
                resumableTrackRef.current === loadedTrack.shareKey
                && saved.shareKey === loadedTrack.shareKey
                && saved.time
                && saved.time < audio.duration - 5
            ) {
                audio.currentTime = saved.time;
                persistedPositionRef.current = saved.time;
            }
        } catch {
            // Ignore malformed values written by older versions.
        }
        resumableTrackRef.current = null;
    }, [currentTrackRef]);

    const createAudio = useCallback((loadedTrack: PlayerTrack) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = loadedTrack.src.replace(/^\/audio\/key\//, `${API_BASE}/api/audio/key/`);

        audio.addEventListener('timeupdate', () => {
            if (audioRef.current !== audio) return;
            setCurrentTime(audio.currentTime);
            const active = currentTrackRef.current;
            if (!active) return;

            if (Math.abs(audio.currentTime - persistedPositionRef.current) >= 5) {
                writeLocalStorage(POSITION_STORAGE_KEY, JSON.stringify({
                    shareKey: active.shareKey,
                    time: audio.currentTime,
                }));
                persistedPositionRef.current = audio.currentTime;
            }
            const threshold = Number.isFinite(audio.duration) && audio.duration > 0
                ? Math.min(30, audio.duration * 0.25)
                : 10;
            if (audio.currentTime >= threshold && recordedPlaySrcRef.current !== active.src) {
                recordedPlaySrcRef.current = active.src;
                recordPlayEvent(active.shareKey, active.source).catch(() => {});
            }
        });
        audio.addEventListener('play', () => audioRef.current === audio && setIsPlaying(true));
        audio.addEventListener('pause', () => audioRef.current === audio && setIsPlaying(false));
        audio.addEventListener('loadedmetadata', () => applyLoadedAudioMetadata(audio, loadedTrack));
        audio.addEventListener('ended', () => {
            if (audioRef.current !== audio) return;
            setIsPlaying(false);
            onEndedRef.current();
        });
        audio.addEventListener('error', () => {
            if (audioRef.current !== audio) return;
            setIsLoading(false);
            setIsPlaying(false);
            setAudioLoaded(false);
            setError('This track could not be loaded. You can skip it from the queue.');
        });

        return audio;
    }, [applyLoadedAudioMetadata, currentTrackRef, onEndedRef]);

    const play = useCallback(() => {
        const selectedTrack = currentTrackRef.current;
        if (!selectedTrack) return;
        const existingAudio = audioRef.current;
        if (existingAudio && !existingAudio.paused) return;

        const playAudio = (audio: HTMLAudioElement) => {
            const playbackAttempt = ++playbackAttemptRef.current;
            setIsLoading(true);
            audio.play().then(() => {
                if (
                    audioRef.current !== audio
                    || currentTrackRef.current?.id !== selectedTrack.id
                    || playbackAttemptRef.current !== playbackAttempt
                ) return;
                setIsPlaying(true);
                setIsLoading(false);
                setError(null);
                trackEvent('audio-play', {title: metadataRef.current?.title || selectedTrack.name});
            }).catch((playError: DOMException) => {
                if (audioRef.current !== audio || playbackAttemptRef.current !== playbackAttempt) return;
                setIsPlaying(false);
                setIsLoading(false);
                if (playError.name === 'AbortError' && audio.paused) return;
                setError(playError.name === 'NotAllowedError'
                    ? 'Playback was blocked. Press play to continue.'
                    : 'Could not play this audio. Try the next track or try again.');
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
        const audio = createAudio(selectedTrack);
        audio.volume = volume;
        audio.muted = isMuted;
        audioRef.current = audio;
        if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
            applyLoadedAudioMetadata(audio, selectedTrack);
        }
        playAudio(audio);
    }, [
        applyLoadedAudioMetadata,
        audioLoaded,
        createAudio,
        currentTrackRef,
        destroyAudio,
        error,
        isMuted,
        metadataRef,
        trackEvent,
        volume,
    ]);

    const pause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || audio.paused) return;
        playbackAttemptRef.current += 1;
        setIsPlaying(false);
        setIsLoading(false);
        audio.pause();
        trackEvent('audio-pause');
    }, [trackEvent]);

    const toggleMute = useCallback(() => {
        const muted = !isMuted;
        setIsMuted(muted);
        if (audioRef.current) audioRef.current.muted = muted;
        trackEvent('audio-mute', {muted});
    }, [isMuted, trackEvent]);

    const reportError = useCallback((message: string) => {
        setError(message);
    }, []);

    const setPlayerVolume = useCallback((value: number) => {
        const clamped = Math.min(1, Math.max(0, value));
        const muted = clamped === 0;
        setVolume(clamped);
        setIsMuted(muted);
        writeLocalStorage(VOLUME_STORAGE_KEY, String(clamped));
        if (audioRef.current) {
            audioRef.current.volume = clamped;
            audioRef.current.muted = muted;
        }
    }, []);

    const seekTo = useCallback((seconds: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        const activeDuration = duration || metadataRef.current?.duration || audio.duration || 0;
        if (!activeDuration) return;
        const time = Math.min(activeDuration, Math.max(0, seconds));
        audio.currentTime = time;
        setCurrentTime(time);
        const active = currentTrackRef.current;
        if (active) {
            writeLocalStorage(POSITION_STORAGE_KEY, JSON.stringify({shareKey: active.shareKey, time}));
            persistedPositionRef.current = time;
        }
    }, [currentTrackRef, duration, metadataRef]);

    const seekBy = useCallback((seconds: number) => {
        seekTo(currentTime + seconds);
    }, [currentTime, seekTo]);

    const adjustVolume = useCallback((delta: number) => {
        setPlayerVolume(volume + delta);
    }, [setPlayerVolume, volume]);

    return {
        audioRef,
        isPlaying,
        duration,
        currentTime,
        volume,
        isMuted,
        error,
        audioLoaded,
        isLoading,
        play,
        pause,
        resetForTrack,
        toggleMute,
        setPlayerVolume,
        seekBy,
        seekTo,
        adjustVolume,
        reportError,
    };
}
