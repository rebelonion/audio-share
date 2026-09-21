import {clamp} from '@/lib/utils';
import {sceneSeed, smoothWaveform} from '../shared/scenery';
import {UNDERWATER_PALETTE} from './palette';

export function createUnderwaterDrift(key: string, waveform: Uint8Array | null, palette = UNDERWATER_PALETTE) {
    const peaks = new Uint8Array(96);
    if (waveform?.length) {
        for (let i = 0; i < peaks.length; i++) {
            const start = Math.floor(i * waveform.length / peaks.length);
            const end = Math.max(start + 1, Math.floor((i + 1) * waveform.length / peaks.length));
            let sum = 0;
            for (let j = start; j < end; j++) sum += waveform[j];
            peaks[i] = Math.round(sum / (end - start));
        }
    }
    return {seed: sceneSeed(key), distant: smoothWaveform(peaks, 12), ridge: smoothWaveform(peaks, 8), palette};
}

export type UnderwaterDrift = ReturnType<typeof createUnderwaterDrift>;

export function underwaterSpan(duration: number): number {
    return Math.min(duration || 120, clamp(duration * 0.18, 65, 250));
}

export function underwaterSeek(time: number, deltaX: number, travelDistance: number, duration: number): number {
    if (travelDistance <= 0 || duration <= 0) return time;
    return clamp(time - deltaX / travelDistance * underwaterSpan(duration), 0, duration);
}

export const REEF = {speed: 0.43, parallaxX: 17, parallaxY: 7};

export function seabedY(world: number, height: number, scale: number): number {
    return height * (0.87 + Math.sin(world / (390 * scale)) * 0.035
        + Math.sin(world / (170 * scale) + 1.8) * 0.018);
}
