import {Suspense, useCallback, useEffect, useId, useRef, useState, type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft, ListMusic, Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Volume2, VolumeX, Wind} from 'lucide-react';
import {useRybbit} from '@/hooks/useRybbit';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';
import CustomSelect from '@/components/CustomSelect';
import QueuePanel from '@/components/QueuePanel';
import {clamp} from '@/lib/utils';
import {loadPlayerWaveform} from '@/lib/playerWaveform';
import {readLocalStorage, writeLocalStorage} from '@/lib/storage';
import {defaultScene, scenes} from './scenes/registry';
import type {ScenePalette} from './scenes/types';
import {useImmersiveControls} from './useImmersiveControls';
import {useImmersiveFullscreen} from './useImmersiveFullscreen';
import ImmersiveErrorBoundary from './ImmersiveErrorBoundary';
import './ImmersivePlayer.css';

const sceneOptions = scenes.map(({id, label}) => ({value: id, label}));
const SCENE_STORAGE_KEY = 'audio-share:immersive-scene';

function formatTime(time: number): string {
    const seconds = Number.isFinite(time) ? Math.max(0, Math.floor(time)) : 0;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ImmersivePlayer({onClose}: {onClose: () => void}) {
    const player = useGlobalAudioPlayer();
    const {track: trackEvent} = useRybbit();
    const {currentTrack, metadata, artist, track, thumbnail, waveformPeaks, currentTime, duration, isPlaying, isLoading, audioLoaded, error, notice} = player;
    const [queueOpen, setQueueOpen] = useState(false);
    const queueButtonRef = useRef<HTMLButtonElement>(null);
    const queueId = useId();
    const closeQueue = useCallback(() => {
        setQueueOpen(false);
        queueButtonRef.current?.focus({preventScroll: true});
    }, []);
    const {fullscreen, supported: fullscreenSupported, pending: fullscreenPending, error: fullscreenError, toggleFullscreen} = useImmersiveFullscreen();
    const {rootRef, closeRef, controlsVisible, revealControls, motion, setMotion} = useImmersiveControls(() => {
        if (document.fullscreenElement) void toggleFullscreen();
        else if (queueOpen) closeQueue();
        else closeImmersive();
    });
    const [sceneId, setSceneId] = useState(() => {
        const saved = readLocalStorage(SCENE_STORAGE_KEY);
        return scenes.find(candidate => candidate.id === saved)?.id ?? defaultScene.id;
    });
    const [scenePickerOpen, setScenePickerOpen] = useState(false);
    const [sceneFailed, setSceneFailed] = useState(false);
    const scene = scenes.find(candidate => candidate.id === sceneId) ?? defaultScene;
    const sceneKey = `${scene.id}:${currentTrack?.id}`;
    const [scenePalette, setScenePalette] = useState<{key: string; colors: ScenePalette} | null>(null);
    const updatePalette = useCallback((colors: ScenePalette) => {
        setScenePalette({key: sceneKey, colors});
    }, [sceneKey]);
    const colors = scenePalette?.key === sceneKey ? scenePalette.colors : null;
    const paletteStyle = colors ? {
        '--card': colors.background,
        '--secondary': colors.control,
        '--card-hover': colors.hover,
        '--border': colors.border,
        '--primary': colors.accent,
        '--primary-border-hover': colors.accent,
    } as CSSProperties : undefined;
    const closeImmersive = () => {
        trackEvent('immersive-player-close', {scene: scene.id});
        onClose();
    };
    const Scene = scene.Component;
    const SceneIcon = scene.icon;
    const [previewTime, setPreviewTime] = useState<number | null>(null);
    const timelineDrag = useRef<{pointerId: number; target: number | null} | null>(null);
    const total = duration || metadata?.duration || 0;
    const position = previewTime ?? currentTime;
    const canSeek = audioLoaded && total > 0;
    const nextTrackKey = player.upcoming[0]?.shareKey;
    const prepareNext = isPlaying && total > 0 && total - currentTime <= 20;

    useEffect(() => {
        if (prepareNext && nextTrackKey) void loadPlayerWaveform(nextTrackKey);
    }, [prepareNext, nextTrackKey]);

    useEffect(() => {
        revealControls();
    }, [currentTrack?.id, isPlaying, revealControls]);

    useEffect(() => {
        timelineDrag.current = null;
        setPreviewTime(null);
    }, [currentTrack?.id, scene.id, canSeek]);

    useEffect(() => {
        if (queueOpen) document.getElementById(queueId)?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
    }, [queueOpen, queueId]);

    const finishTimelineSeek = (input: HTMLInputElement, commit: boolean) => {
        const drag = timelineDrag.current;
        if (!drag) return;
        timelineDrag.current = null;
        if (commit && canSeek && drag.target !== null) player.seekTo(drag.target);
        setPreviewTime(null);
        if (input.hasPointerCapture(drag.pointerId)) input.releasePointerCapture(drag.pointerId);
    };

    if (!currentTrack) return null;
    const visible = controlsVisible || scenePickerOpen || queueOpen || sceneFailed || !isPlaying || !!error || !!notice || !!fullscreenError || previewTime !== null;

    return createPortal(
        <div
            ref={rootRef}
            role="dialog"
            aria-modal="true"
            aria-label="Immersive player"
            className={`immersive-player ${visible ? '' : 'immersive-player--quiet'}`}
            onPointerMove={revealControls}
            onPointerDown={revealControls}
            onFocus={revealControls}
        >
            <ImmersiveErrorBoundary key={scene.id} onError={() => {
                setSceneFailed(true);
                setPreviewTime(null);
            }} fallback={<div className="immersive-scene-loading" role="alert">Scene could not be loaded. Choose another scene or return to the archive.</div>}>
                <Suspense fallback={<div className="immersive-scene-loading" role="status">Loading scene…</div>}>
                    <Scene
                        trackKey={currentTrack.id}
                        thumbnail={thumbnail}
                        peaks={waveformPeaks}
                        currentTime={currentTime}
                        seekVersion={player.seekVersion}
                        duration={total}
                        isPlaying={isPlaying && !isLoading && !error}
                        isLoading={isLoading && !error}
                        motion={motion}
                        canSeek={canSeek}
                        previewTime={previewTime}
                        onPreview={setPreviewTime}
                        onSeek={player.seekTo}
                        onPaletteChange={updatePalette}
                    />
                </Suspense>
            </ImmersiveErrorBoundary>
            <header className="immersive-header immersive-chrome">
                <button ref={closeRef} type="button" className="immersive-back" onClick={closeImmersive} aria-label="Exit immersive player">
                    <ArrowLeft size={17} /> <span>Back to archive</span>
                </button>
                <div className={`immersive-mode ${scenes.length > 1 ? 'immersive-mode--selectable' : ''}`} style={paletteStyle}>
                    <SceneIcon size={16} strokeWidth={1.3} />
                    {scenes.length > 1 ? (
                        <CustomSelect
                            ariaLabel="Scene"
                            value={scene.id}
                            options={sceneOptions}
                            onChange={value => {
                                if (value !== scene.id) trackEvent('immersive-scene-change', {from: scene.id, to: value});
                                setPreviewTime(null);
                                setSceneFailed(false);
                                setSceneId(value);
                                writeLocalStorage(SCENE_STORAGE_KEY, value);
                                revealControls();
                            }}
                            portal={false}
                            onOpenChange={setScenePickerOpen}
                            triggerClassName="immersive-scene-select"
                        />
                    ) : <span>{scene.label}</span>}
                </div>
                <div className="immersive-header-actions">
                    <button type="button" className="immersive-motion" onClick={() => {
                        setMotion(!motion);
                        trackEvent('immersive-motion-change', {scene: scene.id, motion: !motion});
                    }} aria-pressed={!motion} aria-label="Still scene" title={motion ? 'Pause scenery motion' : 'Resume scenery motion'}>
                        <Wind size={17} /><span>{motion ? 'Motion on' : 'Still scene'}</span>
                    </button>
                    {fullscreenSupported && <button type="button" onClick={() => void toggleFullscreen()} disabled={fullscreenPending} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                        {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
                    </button>}
                </div>
            </header>
            <div className="immersive-title immersive-chrome">
                <p>{metadata?.artist || artist || 'Now playing'}</p>
                <h2>{metadata?.title || track}</h2>
            </div>
            <div className="immersive-controls immersive-chrome">
                {(error || notice) && <p className="immersive-notice" role={error ? 'alert' : 'status'}>{error || notice}</p>}
                {fullscreenError && <p className="immersive-notice" role="alert">{fullscreenError}</p>}
                <div className="immersive-timeline">
                    <span>{formatTime(position)}</span>
                    <input
                        key={sceneKey}
                        type="range" aria-label="Playback position"
                        aria-valuetext={`${formatTime(position)} of ${formatTime(total)}`}
                        min={0} max={total || 1} step={0.1} value={clamp(position, 0, total || 1)} disabled={!canSeek}
                        onPointerDown={event => {
                            if (!canSeek || !event.isPrimary || event.button !== 0) return;
                            timelineDrag.current = {pointerId: event.pointerId, target: null};
                            event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onChange={event => {
                            const time = Number(event.target.value);
                            if (timelineDrag.current) {
                                timelineDrag.current.target = time;
                                setPreviewTime(time);
                            } else if (canSeek) player.seekTo(time);
                        }}
                        onPointerUp={event => {
                            if (timelineDrag.current?.pointerId === event.pointerId) finishTimelineSeek(event.currentTarget, true);
                        }}
                        onPointerCancel={event => {
                            if (timelineDrag.current?.pointerId === event.pointerId) finishTimelineSeek(event.currentTarget, false);
                        }}
                        onLostPointerCapture={event => {
                            if (timelineDrag.current?.pointerId === event.pointerId) finishTimelineSeek(event.currentTarget, false);
                        }}
                        onBlur={event => finishTimelineSeek(event.currentTarget, false)}
                        style={{'--immersive-progress': `${total ? clamp(position / total, 0, 1) * 100 : 0}%`} as CSSProperties}
                    />
                    <span>{formatTime(total)}</span>
                </div>
                <div className="immersive-toolbar">
                    <div className="immersive-description">
                        <p className="immersive-hint">{previewTime !== null ? `Release to seek · ${formatTime(previewTime)}` : canSeek ? scene.seekHint : scene.idleHint}</p>
                        <p className="immersive-caption">{waveformPeaks?.length ? scene.waveformCaption : scene.fallbackCaption}</p>
                    </div>
                    <div className="immersive-transport">
                        <button type="button" onClick={player.skipPrevious} aria-label="Previous track"><SkipBack size={18} /></button>
                        <button type="button" onClick={() => player.seekBy(-10)} disabled={!canSeek} aria-label="Seek backward 10 seconds" className="immersive-skip"><RotateCcw size={22} /><span>10</span></button>
                        <button type="button" className="immersive-play" onClick={player.togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                            {isLoading ? <Loader2 size={23} className="animate-spin" /> : isPlaying ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}
                        </button>
                        <button type="button" onClick={() => player.seekBy(30)} disabled={!canSeek} aria-label="Seek forward 30 seconds" className="immersive-skip"><RotateCw size={22} /><span>30</span></button>
                        <button type="button" onClick={player.skipNext} aria-label="Next track"><SkipForward size={18} /></button>
                    </div>
                    <div className="immersive-tools">
                        <div className="immersive-volume">
                            <button type="button" onClick={player.toggleMute} aria-label={player.isMuted ? 'Unmute' : 'Mute'}>{player.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                            <input type="range" aria-label="Volume" min={0} max={1} step={0.01} value={player.isMuted ? 0 : player.volume} onChange={event => player.setVolume(Number(event.target.value))} />
                        </div>
                        <button ref={queueButtonRef} type="button" className="immersive-queue-toggle" aria-label={`Queue, ${player.upcoming.length} ${player.upcoming.length === 1 ? 'track' : 'tracks'} upcoming`} aria-expanded={queueOpen} aria-controls={queueOpen ? queueId : undefined} title="Playback queue" onClick={() => {
                            setQueueOpen(!queueOpen);
                            if (!queueOpen) trackEvent('immersive-queue-open', {scene: scene.id});
                        }}>
                            <ListMusic size={19} /><span>{player.upcoming.length}</span>
                        </button>
                    </div>
                </div>
                <div className="immersive-footer"><span><span className="immersive-playback-hint">K to {isPlaying ? 'pause' : 'play'} <b>·</b> </span>Esc to {fullscreen ? 'exit fullscreen' : queueOpen ? 'close queue' : 'leave'}</span></div>
            </div>
            {queueOpen && <QueuePanel id={queueId} className="immersive-queue" style={paletteStyle} onClose={closeQueue} />}
        </div>,
        document.body,
    );
}
