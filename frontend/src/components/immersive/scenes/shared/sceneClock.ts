import type {ScenePlaybackProps} from '../types';

export function createSceneClock(initial: ScenePlaybackProps, now: number, travelSpan: (duration: number) => number) {
    let lastFrame = now;
    let ambientTime = 0;
    let observedTime = initial.currentTime;
    let observedAt = now;
    let stillTime = observedTime;
    let cameraX = 0;
    let cameraY = 0;
    let wasPlaying = false;
    let trackKey = initial.trackKey;
    let seekVersion = initial.seekVersion;
    let span = travelSpan(initial.duration);
    let travel = observedTime / span;
    let previousTime = observedTime;
    let wasLoading = false;
    let wasPreviewing = false;

    return {
        resume(now: number) {
            lastFrame = now;
            observedAt = now;
        },
        step(now: number, current: ScenePlaybackProps, pointer: {x: number; y: number}) {
            const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
            lastFrame = now;
            const trackChanged = trackKey !== current.trackKey;
            if (!trackChanged && !current.motion && current.seekVersion !== seekVersion) {
                travel += (current.currentTime - stillTime) / span;
                stillTime = current.currentTime;
                previousTime = stillTime;
            }
            seekVersion = current.seekVersion;
            const previewing = current.previewTime !== null;
            const playing = current.isPlaying && !previewing;
            if (trackChanged || observedTime !== current.currentTime || playing !== wasPlaying) {
                observedTime = current.currentTime;
                observedAt = now;
            }
            const extrapolation = playing ? Math.min((now - observedAt) / 1000, 0.3) : 0;
            const time = current.previewTime ?? Math.min(current.duration || Infinity, observedTime + extrapolation);
            const loading = current.isLoading && !previewing;
            if (current.duration > 0) span += (travelSpan(current.duration) - span) * Math.min(1, elapsed / 0.8);
            if (current.motion) {
                if (loading || (trackChanged && (wasPlaying || wasLoading))) {
                    travel += elapsed / span;
                } else if (!trackChanged && !wasLoading && (playing === wasPlaying || previewing || wasPreviewing)) {
                    travel += (time - previousTime) / span;
                }
            }
            if (trackChanged || current.motion) stillTime = time;
            previousTime = current.motion ? time : stillTime;
            trackKey = current.trackKey;
            wasPlaying = playing;
            wasLoading = loading;
            wasPreviewing = previewing;
            if (current.motion) {
                ambientTime += elapsed;
                cameraX += (pointer.x - cameraX) * 0.04;
                cameraY += (pointer.y - cameraY) * 0.04;
            }
            return {
                elapsed,
                time: current.motion ? time : current.previewTime ?? stillTime,
                duration: current.duration,
                ambientTime,
                moving: (playing || loading) && current.motion,
                pointerX: current.motion ? cameraX : 0,
                pointerY: current.motion ? cameraY : 0,
                travel: !current.motion && previewing ? travel + (time - stillTime) / span : travel,
                travelSpan: span,
            };
        },
    };
}
