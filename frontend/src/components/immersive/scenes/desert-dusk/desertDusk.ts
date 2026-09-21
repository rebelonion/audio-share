import {clamp} from '@/lib/utils';
import {sceneSeed, smoothWaveform} from '../shared/scenery';
import {DESERT_PALETTE} from './palette';

export function createDesertDusk(sceneryKey: string, waveform: Uint8Array | null, palette = DESERT_PALETTE) {
    // Broad envelopes keep the dunes rounded even on dense or percussive recordings.
    const peaks = new Uint8Array(128);
    if (waveform?.length) {
        for (let i = 0; i < peaks.length; i++) {
            const start = Math.floor(i * waveform.length / peaks.length);
            const end = Math.max(start + 1, Math.floor((i + 1) * waveform.length / peaks.length));
            let sum = 0;
            for (let j = start; j < end; j++) sum += waveform[j];
            peaks[i] = Math.round(sum / (end - start));
        }
    }
    return {seed: sceneSeed(sceneryKey), dunes: smoothWaveform(peaks, 6), distant: smoothWaveform(peaks, 12), palette};
}

export type DesertDusk = ReturnType<typeof createDesertDusk>;

export function desertSpan(duration: number): number {
    return Math.min(duration || 120, clamp(duration * 0.16, 50, 220));
}

export function desertSeek(time: number, deltaX: number, travelDistance: number, duration: number): number {
    if (travelDistance <= 0 || duration <= 0) return time;
    return clamp(time - deltaX / travelDistance * desertSpan(duration), 0, duration);
}

export function duneContour(world: number, scale: number, phase: number): number {
    return Math.sin(world / (310 * scale) + phase) * 0.032
        + Math.sin(world / (670 * scale) + phase * 1.7) * 0.026
        + Math.sin(world / (155 * scale) + phase + 0.7) * 0.008;
}

export const DESERT_GROUND = {speed: 0.44, parallaxX: 16, parallaxY: 6};

export function desertGroundY(world: number, height: number, scale: number): number {
    return height * (0.79 + duneContour(world, scale, 3.4));
}
