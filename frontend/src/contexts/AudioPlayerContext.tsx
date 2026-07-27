import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import MatureContentDialog from '@/components/MatureContentDialog';
import {getRecommendations, type TrackSummary} from '@/lib/api';
import {registerMediaSessionActions} from '@/lib/mediaSession';
import {
    needsMaturePlaybackConfirmation,
    shouldWaitForMaturePlaybackMetadata,
} from '@/lib/maturePlayback';
import {
    advance,
    clearUpcoming,
    enqueue,
    makePlayerTrack,
    nextPlaybackStep,
    nextPlaybackStepForCurrent,
    queueForPersistence,
    removeQueued,
    retreat,
    startContext,
    startSingleton,
    type PlayerTrack,
    type QueueState,
    type TrackSource,
} from '@/lib/playerQueue';
import {removeLocalStorage, writeLocalStorage} from '@/lib/storage';
import {
    POSITION_STORAGE_KEY,
    useAudioEngine,
} from '@/hooks/useAudioEngine';
import {
    QUEUE_STORAGE_KEY,
    usePersistentPlayerQueue,
} from '@/hooks/usePersistentPlayerQueue';
import {
    usePlayerMetadata,
    type PlayerMetadata,
} from '@/hooks/usePlayerMetadata';
import {useRybbit} from '@/hooks/useRybbit';

export interface AudioPlayerTrack {
    id?: string;
    src: string;
    shareKey?: string;
    name?: string;
    artist?: string;
    deleted?: boolean;
    ageLimit?: number;
    source?: TrackSource;
}

type QueueActionResult = 'ignored' | 'ready' | 'queued' | 'playing';

interface AudioPlayerContextValue {
    currentTrack: PlayerTrack | null;
    isPlaying: boolean;
    duration: number;
    currentTime: number;
    volume: number;
    isMuted: boolean;
    error: string | null;
    notice: string | null;
    thumbnail: string | null;
    metadata: PlayerMetadata | null;
    audioLoaded: boolean;
    isLoading: boolean;
    artist: string;
    track: string;
    waveformPeaks: Uint8Array | null;
    upcoming: PlayerTrack[];
    contextLabel: string | null;
    autoplay: boolean;
    playTrack: (track: AudioPlayerTrack) => void;
    playContext: (tracks: AudioPlayerTrack[], selectedIndex: number, label: string) => void;
    addToQueue: (track: AudioPlayerTrack) => QueueActionResult;
    playNext: (track: AudioPlayerTrack) => QueueActionResult;
    removeFromQueue: (id: string) => void;
    clearQueue: () => void;
    skipNext: () => void;
    skipPrevious: () => void;
    closePlayer: () => void;
    toggleAutoplay: () => void;
    togglePlay: () => void;
    toggleMute: () => void;
    seekBy: (seconds: number) => void;
    seekTo: (seconds: number) => void;
    adjustVolume: (delta: number) => void;
    setVolume: (volume: number) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);
type AudioPlayerCommandsContextValue = Pick<
    AudioPlayerContextValue,
    'playTrack' | 'playContext' | 'addToQueue' | 'playNext'
>;
const AudioPlayerCommandsContext = createContext<AudioPlayerCommandsContextValue | null>(null);

function getKey(src: string): string {
    return src.replace(/^\/audio\/key\//, '');
}

function normalizeTrack(track: AudioPlayerTrack): PlayerTrack {
    const shareKey = track.shareKey || getKey(track.src);
    return makePlayerTrack({
        id: track.id,
        src: track.src,
        shareKey,
        name: track.name || shareKey,
        artist: track.artist,
        deleted: track.deleted,
        ageLimit: track.ageLimit,
        source: track.source || 'manual',
    });
}

function recommendationToTrack(track: TrackSummary): PlayerTrack {
    return makePlayerTrack({
        src: `/audio/key/${track.shareKey}`,
        shareKey: track.shareKey,
        name: track.title || track.filename,
        artist: track.artist || track.parentFolderName || undefined,
        ageLimit: track.ageLimit,
        source: 'autoplay',
    });
}

function maturePlaybackAcknowledged(): boolean {
    return sessionStorage.getItem('mature-warning-ack') === 'true';
}

export function AudioPlayerProvider({children}: {children: ReactNode}) {
    const {track: trackEvent} = useRybbit();
    const {queue, queueRef, updateQueue} = usePersistentPlayerQueue();
    const currentTrack = queue.current;
    const currentTrackRef = useRef(currentTrack);
    currentTrackRef.current = currentTrack;

    const {
        metadata,
        thumbnail,
        waveformPeaks,
        waveformDuration,
    } = usePlayerMetadata(currentTrack);
    const metadataRef = useRef(metadata);
    metadataRef.current = metadata;

    const advancePlaybackRef = useRef<() => void>(() => {});
    const {
        audioRef,
        isPlaying,
        duration,
        currentTime,
        volume,
        isMuted,
        error,
        notice,
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
    } = useAudioEngine({
        currentTrackRef,
        metadataRef,
        onEndedRef: advancePlaybackRef,
        waveformDuration,
    });

    const [showMatureDialog, setShowMatureDialog] = useState(false);
    const pendingPlayRef = useRef(false);
    const pendingMatureMetadataPlayRef = useRef<string | null>(null);
    const requestPlayCurrentRef = useRef<() => void>(() => {});
    const pauseCurrentRef = useRef<() => void>(() => {});
    const seekToRef = useRef(seekTo);
    const recommendationControllerRef = useRef<AbortController | null>(null);
    seekToRef.current = seekTo;

    const upcoming = useMemo(() => [...queue.manual, ...queue.context], [queue.context, queue.manual]);

    useEffect(() => {
        const persistLatestQueue = () => {
            writeLocalStorage(QUEUE_STORAGE_KEY, JSON.stringify(queueForPersistence(queueRef.current)));
            const active = queueRef.current.current;
            const audio = audioRef.current;
            if (active && audio) {
                writeLocalStorage(POSITION_STORAGE_KEY, JSON.stringify({
                    shareKey: active.shareKey,
                    time: audio.currentTime,
                }));
            }
        };
        window.addEventListener('pagehide', persistLatestQueue);
        return () => window.removeEventListener('pagehide', persistLatestQueue);
    }, [audioRef, queueRef]);

    useEffect(() => () => recommendationControllerRef.current?.abort(), []);

    const transitionQueue = useCallback((next: QueueState, shouldPlay = false) => {
        if (queueRef.current.current?.id !== next.current?.id) {
            recommendationControllerRef.current?.abort();
            setShowMatureDialog(false);
            pendingMatureMetadataPlayRef.current = null;
            resetForTrack();
        }
        updateQueue(next);
        pendingPlayRef.current = shouldPlay && !!next.current;
    }, [queueRef, resetForTrack, updateQueue]);

    const playTrack = useCallback((track: AudioPlayerTrack) => {
        if (track.deleted) return;
        transitionQueue(startSingleton(queueRef.current, normalizeTrack(track)), true);
    }, [queueRef, transitionQueue]);

    const playContext = useCallback((tracks: AudioPlayerTrack[], selectedIndex: number, label: string) => {
        const playable = tracks.flatMap((track, index) => (
            track.deleted ? [] : [{track: normalizeTrack(track), selected: index === selectedIndex}]
        ));
        if (playable.length === 0) return;
        const playableIndex = playable.findIndex(item => item.selected);
        transitionQueue(
            startContext(
                queueRef.current,
                playable.map(item => item.track),
                Math.max(0, playableIndex),
                label,
            ),
            true,
        );
    }, [queueRef, transitionQueue]);

    const addToQueue = useCallback((track: AudioPlayerTrack): QueueActionResult => {
        if (track.deleted) return 'ignored';
        const normalized = normalizeTrack(track);
        let result: QueueActionResult;
        if (!queueRef.current.current) {
            transitionQueue(startSingleton(queueRef.current, normalized));
            result = 'ready';
        } else {
            transitionQueue(enqueue(queueRef.current, normalized));
            result = 'queued';
        }
        trackEvent('queue-add', {
            position: 'end',
            shareKey: normalized.shareKey,
            source: normalized.source,
            result,
        });
        return result;
    }, [queueRef, trackEvent, transitionQueue]);

    const playNext = useCallback((track: AudioPlayerTrack): QueueActionResult => {
        if (track.deleted) return 'ignored';
        const normalized = normalizeTrack(track);
        let result: QueueActionResult;
        if (!queueRef.current.current || audioRef.current?.ended) {
            transitionQueue(startSingleton(queueRef.current, normalized), true);
            result = needsMaturePlaybackConfirmation(normalized, null, maturePlaybackAcknowledged())
                ? 'ready'
                : 'playing';
        } else {
            transitionQueue(enqueue(queueRef.current, normalized, true));
            result = 'queued';
        }
        trackEvent('queue-add', {
            position: 'next',
            shareKey: normalized.shareKey,
            source: normalized.source,
            result,
        });
        return result;
    }, [audioRef, queueRef, trackEvent, transitionQueue]);

    const removeFromQueue = useCallback((id: string) => {
        transitionQueue(removeQueued(queueRef.current, id));
    }, [queueRef, transitionQueue]);

    const clearQueue = useCallback(() => {
        transitionQueue(clearUpcoming(queueRef.current));
    }, [queueRef, transitionQueue]);

    const closePlayer = useCallback(() => {
        recommendationControllerRef.current?.abort();
        setShowMatureDialog(false);
        resetForTrack();
        updateQueue({
            ...queueRef.current,
            current: null,
            history: [],
            context: [],
            manual: [],
            contextLabel: null,
        });
        pendingPlayRef.current = false;
        pendingMatureMetadataPlayRef.current = null;
        removeLocalStorage(POSITION_STORAGE_KEY);
    }, [queueRef, resetForTrack, updateQueue]);

    const requestPlayCurrent = useCallback(() => {
        recommendationControllerRef.current?.abort();
        const selectedTrack = queueRef.current.current;
        if (shouldWaitForMaturePlaybackMetadata(
            selectedTrack,
            metadataRef.current,
            maturePlaybackAcknowledged(),
        )) {
            pendingMatureMetadataPlayRef.current = selectedTrack?.id || null;
            return;
        }
        pendingMatureMetadataPlayRef.current = null;
        if (needsMaturePlaybackConfirmation(
            selectedTrack,
            metadataRef.current,
            maturePlaybackAcknowledged(),
        )) {
            setShowMatureDialog(true);
            return;
        }
        play();
    }, [play, queueRef]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
            pause();
            return;
        }
        requestPlayCurrent();
    }, [audioRef, pause, requestPlayCurrent]);

    requestPlayCurrentRef.current = requestPlayCurrent;
    pauseCurrentRef.current = pause;

    useEffect(() => {
        if (!pendingPlayRef.current || !currentTrack) return;
        pendingPlayRef.current = false;
        requestPlayCurrentRef.current();
    }, [currentTrack]);

    useEffect(() => {
        if (
            metadata
            && currentTrack
            && pendingMatureMetadataPlayRef.current === currentTrack.id
        ) {
            requestPlayCurrentRef.current();
        }
    }, [currentTrack, metadata]);

    const advancePlayback = useCallback(async () => {
        recommendationControllerRef.current?.abort();
        const state = queueRef.current;
        const step = nextPlaybackStep(state);
        if (step.type === 'advance') {
            transitionQueue(step.state, true);
            return;
        }
        if (step.type === 'stop' || !state.current) return;

        const controller = new AbortController();
        recommendationControllerRef.current = controller;
        try {
            const recommendations = await getRecommendations(state.current.shareKey, controller.signal);
            if (controller.signal.aborted) return;
            const latest = queueRef.current;
            const latestStep = nextPlaybackStepForCurrent(latest, state.current.id);
            if (!latestStep) return;
            if (latestStep.type === 'advance') {
                transitionQueue(latestStep.state, true);
                return;
            }
            if (latestStep.type !== 'recommend') return;

            const excluded = new Set([
                state.current.shareKey,
                ...state.history.slice(-50).map(track => track.shareKey),
            ]);
            const candidates = recommendations
                .map(recommendationToTrack)
                .filter(track => !track.deleted && !excluded.has(track.shareKey));
            if (candidates.length === 0) return;
            transitionQueue(advance({...latest, context: candidates, contextLabel: 'Autoplay'}), true);
        } catch {
            if (controller.signal.aborted) return;
            const latestStep = nextPlaybackStepForCurrent(queueRef.current, state.current.id);
            if (latestStep?.type === 'advance') {
                transitionQueue(latestStep.state, true);
            } else if (latestStep?.type === 'recommend') {
                reportError('Autoplay could not find another track.');
            }
        } finally {
            if (recommendationControllerRef.current === controller) {
                recommendationControllerRef.current = null;
            }
        }
    }, [queueRef, reportError, transitionQueue]);

    advancePlaybackRef.current = () => {
        removeLocalStorage(POSITION_STORAGE_KEY);
        void advancePlayback();
    };

    const skipNext = useCallback(() => {
        void advancePlayback();
    }, [advancePlayback]);

    const skipPrevious = useCallback(() => {
        recommendationControllerRef.current?.abort();
        const next = retreat(queueRef.current);
        if (next.current?.id !== queueRef.current.current?.id) {
            transitionQueue(next, true);
        } else {
            seekToRef.current(0);
        }
    }, [queueRef, transitionQueue]);

    const toggleAutoplay = useCallback(() => {
        const enabled = !queueRef.current.autoplay;
        updateQueue({...queueRef.current, autoplay: enabled});
        trackEvent('autoplay-toggle', {enabled});
    }, [queueRef, trackEvent, updateQueue]);

    useEffect(() => {
        if (!('mediaSession' in navigator) || !currentTrack) return;
        return registerMediaSessionActions(navigator.mediaSession, {
            play: () => requestPlayCurrentRef.current(),
            pause: () => pauseCurrentRef.current(),
            next: () => advancePlaybackRef.current(),
            previous: () => skipPrevious(),
        });
    }, [currentTrack, skipPrevious]);

    const value = useMemo<AudioPlayerContextValue>(() => ({
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
        artist: currentTrack?.artist || '',
        track: currentTrack?.name || '',
        waveformPeaks,
        upcoming,
        contextLabel: queue.contextLabel,
        autoplay: queue.autoplay,
        playTrack,
        playContext,
        addToQueue,
        playNext,
        removeFromQueue,
        clearQueue,
        skipNext,
        skipPrevious,
        closePlayer,
        toggleAutoplay,
        togglePlay,
        toggleMute,
        seekBy,
        seekTo,
        adjustVolume,
        setVolume: setPlayerVolume,
    }), [
        addToQueue,
        clearQueue,
        closePlayer,
        currentTrack,
        adjustVolume,
        audioLoaded,
        currentTime,
        duration,
        error,
        notice,
        isLoading,
        isMuted,
        isPlaying,
        metadata,
        playContext,
        playNext,
        playTrack,
        queue.autoplay,
        queue.contextLabel,
        removeFromQueue,
        seekBy,
        seekTo,
        setPlayerVolume,
        skipNext,
        skipPrevious,
        thumbnail,
        toggleAutoplay,
        toggleMute,
        togglePlay,
        upcoming,
        volume,
        waveformPeaks,
    ]);

    const commands = useMemo<AudioPlayerCommandsContextValue>(() => ({
        playTrack,
        playContext,
        addToQueue,
        playNext,
    }), [addToQueue, playContext, playNext, playTrack]);

    return (
        <AudioPlayerCommandsContext.Provider value={commands}>
            <AudioPlayerContext.Provider value={value}>
                {children}
                <MatureContentDialog
                    open={showMatureDialog}
                    onCancel={() => setShowMatureDialog(false)}
                    onConfirm={() => {
                        sessionStorage.setItem('mature-warning-ack', 'true');
                        setShowMatureDialog(false);
                        play();
                    }}
                />
            </AudioPlayerContext.Provider>
        </AudioPlayerCommandsContext.Provider>
    );
}

export function useGlobalAudioPlayer() {
    const value = useContext(AudioPlayerContext);
    if (!value) throw new Error('useGlobalAudioPlayer must be used within AudioPlayerProvider');
    return value;
}

export function useAudioPlayerCommands() {
    const value = useContext(AudioPlayerCommandsContext);
    if (!value) throw new Error('useAudioPlayerCommands must be used within AudioPlayerProvider');
    return value;
}
