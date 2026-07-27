import {useCallback, useEffect, useRef, useState, type MutableRefObject} from 'react';
import {recordPlayEvent} from '@/lib/api';
import {useRybbit} from '@/hooks/useRybbit';
import type {PlayerMetadata} from '@/hooks/usePlayerMetadata';
import type {PlayerTrack} from '@/lib/playerQueue';
import {
    mediaAccessErrorMessage,
    mediaAccessURL,
    requestMediaAccess,
    type MediaAccessGrant,
} from '@/lib/mediaAccess';
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
    const [notice, setNotice] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioListenersRef = useRef<Array<[string, EventListener]>>([]);
    const volumeRef = useRef(volume);
    const isMutedRef = useRef(isMuted);
    const resumableTrackRef = useRef(currentTrackRef.current?.shareKey || null);
    const recordedPlaySrcRef = useRef<string | null>(null);
    const persistedPositionRef = useRef(0);
    const playbackAttemptRef = useRef(0);
    const blockedPlaybackRef = useRef<HTMLAudioElement | null>(null);
    const loadAttemptRef = useRef(0);
    const activeGrantRef = useRef<MediaAccessGrant | null>(null);
    const accessRequestRef = useRef<{
        shareKey: string;
        controller: AbortController;
        promise: Promise<MediaAccessGrant>;
    } | null>(null);
    const recoveredExpiredKeyRef = useRef<string | null>(null);
    const recoverExpiredAccessRef = useRef<(audio: HTMLAudioElement, track: PlayerTrack) => void>(() => {});

    useEffect(() => {
        if (waveformDuration > 0) setDuration(waveformDuration);
    }, [waveformDuration]);

    const resetPlaybackState = useCallback(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setAudioLoaded(false);
        setError(null);
        setNotice(null);
        setIsLoading(false);
    }, []);

    const removeAudioListeners = useCallback((audio: HTMLAudioElement) => {
        for (const [name, listener] of audioListenersRef.current) {
            audio.removeEventListener(name, listener);
        }
        audioListenersRef.current = [];
    }, []);

    const clearAudio = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        removeAudioListeners(audio);
        if (blockedPlaybackRef.current === audio) {
            blockedPlaybackRef.current = null;
        }
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
    }, [removeAudioListeners]);

    const destroyAudio = useCallback(() => {
        clearAudio();
        audioRef.current = null;
    }, [clearAudio]);

    useEffect(() => () => {
        accessRequestRef.current?.controller.abort();
        loadAttemptRef.current += 1;
        destroyAudio();
    }, [destroyAudio]);

    const resetForTrack = useCallback(() => {
        accessRequestRef.current?.controller.abort();
        accessRequestRef.current = null;
        clearAudio();
        resetPlaybackState();
        resumableTrackRef.current = null;
        recordedPlaySrcRef.current = null;
        persistedPositionRef.current = 0;
        activeGrantRef.current = null;
        blockedPlaybackRef.current = null;
        recoveredExpiredKeyRef.current = null;
        loadAttemptRef.current += 1;
        playbackAttemptRef.current += 1;
    }, [clearAudio, resetPlaybackState]);

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

    const createAudio = useCallback((
        loadedTrack: PlayerTrack,
        grant: MediaAccessGrant,
        resumeAt?: number,
    ) => {
        const audio = audioRef.current || new Audio();
        removeAudioListeners(audio);

        const listen = (name: string, listener: EventListener) => {
            audio.addEventListener(name, listener);
            audioListenersRef.current.push([name, listener]);
        };

        audio.preload = 'metadata';
        audio.src = mediaAccessURL(loadedTrack.shareKey, 'stream', grant.accessKey);

        listen('timeupdate', () => {
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
                recordPlayEvent(active.shareKey, grant.accessKey, active.source).catch(() => {});
            }
        });
        listen('play', () => {
            if (audioRef.current === audio) setIsPlaying(true);
        });
        listen('pause', () => {
            if (audioRef.current === audio) setIsPlaying(false);
        });
        listen('loadedmetadata', () => {
            applyLoadedAudioMetadata(audio, loadedTrack);
            if (resumeAt && resumeAt < audio.duration) {
                audio.currentTime = resumeAt;
                persistedPositionRef.current = resumeAt;
            }
        });
        listen('ended', () => {
            if (audioRef.current !== audio) return;
            setIsPlaying(false);
            onEndedRef.current();
        });
        listen('error', () => {
            if (audioRef.current !== audio) return;
            if (blockedPlaybackRef.current === audio) {
                blockedPlaybackRef.current = null;
            }
            if (
                Date.now() >= grant.expiresAt
                && recoveredExpiredKeyRef.current !== grant.accessKey
            ) {
                recoveredExpiredKeyRef.current = grant.accessKey;
                recoverExpiredAccessRef.current(audio, loadedTrack);
                return;
            }
            setIsLoading(false);
            setIsPlaying(false);
            setAudioLoaded(false);
            setNotice(null);
            setError('This track could not be loaded. You can skip it from the queue.');
        });

        return audio;
    }, [applyLoadedAudioMetadata, currentTrackRef, onEndedRef, removeAudioListeners]);

    const requestStreamAccess = useCallback((track: PlayerTrack): Promise<MediaAccessGrant> => {
        const pending = accessRequestRef.current;
        if (pending?.shareKey === track.shareKey) return pending.promise;
        pending?.controller.abort();

        const controller = new AbortController();
        const request = requestMediaAccess(track.shareKey, 'stream', {
            signal: controller.signal,
            onPhase: phase => {
                if (accessRequestRef.current?.controller !== controller) return;
                setNotice(phase === 'verifying' ? 'Verifying playback…' : null);
            },
        });
        accessRequestRef.current = {
            shareKey: track.shareKey,
            controller,
            promise: request,
        };
        const clearPendingRequest = () => {
            if (accessRequestRef.current?.promise === request) {
                accessRequestRef.current = null;
            }
        };
        void request.then(clearPendingRequest, clearPendingRequest);
        return request;
    }, []);

    const playAudio = useCallback((audio: HTMLAudioElement, selectedTrack: PlayerTrack) => {
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
            setNotice(null);
            if (blockedPlaybackRef.current === audio) {
                blockedPlaybackRef.current = null;
            }
            trackEvent('audio-play', {
                title: metadataRef.current?.title || selectedTrack.name,
                shareKey: selectedTrack.shareKey,
                source: selectedTrack.source,
                resumed: audio.currentTime > 0,
            });
        }).catch((playError: DOMException) => {
            if (audioRef.current !== audio || playbackAttemptRef.current !== playbackAttempt) return;
            setIsPlaying(false);
            setIsLoading(false);
            if (playError.name === 'AbortError' && audio.paused) return;
            if (playError.name === 'NotAllowedError') {
                blockedPlaybackRef.current = audio;
                setError(null);
                setNotice('Ready to play — press play to continue.');
            } else {
                blockedPlaybackRef.current = null;
                setNotice(null);
                setError('Could not play this audio. Try the next track or try again.');
            }
        });
    }, [currentTrackRef, metadataRef, trackEvent]);

    const loadAuthorizedAudio = useCallback(async (selectedTrack: PlayerTrack, resumeAt?: number) => {
        const loadAttempt = ++loadAttemptRef.current;
        setIsLoading(true);
        setError(null);
        setNotice(null);
        setAudioLoaded(false);
        try {
            const grant = await requestStreamAccess(selectedTrack);
            if (
                loadAttemptRef.current !== loadAttempt
                || currentTrackRef.current?.id !== selectedTrack.id
            ) return;

            clearAudio();
            const audio = createAudio(selectedTrack, grant, resumeAt);
            audio.volume = volumeRef.current;
            audio.muted = isMutedRef.current;
            activeGrantRef.current = grant;
            recoveredExpiredKeyRef.current = null;
            audioRef.current = audio;
            if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
                applyLoadedAudioMetadata(audio, selectedTrack);
                if (resumeAt && resumeAt < audio.duration) {
                    audio.currentTime = resumeAt;
                    persistedPositionRef.current = resumeAt;
                }
            }
            playAudio(audio, selectedTrack);
        } catch (accessError) {
            if (
                loadAttemptRef.current !== loadAttempt
                || currentTrackRef.current?.id !== selectedTrack.id
                || (accessError instanceof DOMException && accessError.name === 'AbortError')
            ) return;
            setIsPlaying(false);
            setIsLoading(false);
            setAudioLoaded(false);
            setNotice(null);
            setError(mediaAccessErrorMessage(accessError, 'play'));
        }
    }, [
        applyLoadedAudioMetadata,
        createAudio,
        currentTrackRef,
        clearAudio,
        playAudio,
        requestStreamAccess,
    ]);

    recoverExpiredAccessRef.current = (audio, track) => {
        const resumeAt = audio.currentTime;
        void loadAuthorizedAudio(track, resumeAt);
    };

    const play = useCallback(() => {
        const selectedTrack = currentTrackRef.current;
        if (!selectedTrack) return;
        const existingAudio = audioRef.current;
        if (existingAudio && !existingAudio.paused) return;

        const grant = activeGrantRef.current;
        const hasValidGrant = grant && Date.now() < grant.expiresAt;
        if (
            existingAudio
            && !existingAudio.ended
            && hasValidGrant
            && (
                blockedPlaybackRef.current === existingAudio
                || (audioLoaded && !error)
            )
        ) {
            playAudio(existingAudio, selectedTrack);
            return;
        }

        const resumeAt = existingAudio && !existingAudio.ended ? existingAudio.currentTime : undefined;
        void loadAuthorizedAudio(selectedTrack, resumeAt);
    }, [
        audioLoaded,
        currentTrackRef,
        error,
        loadAuthorizedAudio,
        playAudio,
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
        const muted = !isMutedRef.current;
        isMutedRef.current = muted;
        setIsMuted(muted);
        if (audioRef.current) audioRef.current.muted = muted;
        trackEvent('audio-mute', {muted});
    }, [trackEvent]);

    const reportError = useCallback((message: string) => {
        setError(message);
    }, []);

    const setPlayerVolume = useCallback((value: number) => {
        const clamped = Math.min(1, Math.max(0, value));
        const muted = clamped === 0;
        volumeRef.current = clamped;
        isMutedRef.current = muted;
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
        notice,
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
