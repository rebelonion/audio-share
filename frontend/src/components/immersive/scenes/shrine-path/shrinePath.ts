import {clamp} from '@/lib/utils';
import {sceneSeed, smoothWaveform} from '../shared/scenery';
import {SHRINE_PALETTE, type ShrinePalette} from './palette';

export interface ShrinePath {
    seed: number;
    ridges: number[];
    hills: number[];
    palette: ShrinePalette;
}

export function createShrinePath(sceneryKey: string, waveform: Uint8Array | null, palette = SHRINE_PALETTE): ShrinePath {
    const peaks = waveform?.length ? waveform : new Uint8Array(2);
    return {seed: sceneSeed(sceneryKey), ridges: smoothWaveform(peaks, 12), hills: smoothWaveform(peaks, 5), palette};
}

export function shrineSpan(duration: number): number {
    return Math.min(duration || 120, clamp(duration * 0.14, 45, 200));
}

export function shrineSeek(time: number, deltaX: number, travelDistance: number, duration: number): number {
    if (travelDistance <= 0 || duration <= 0) return time;
    return clamp(time - deltaX / travelDistance * shrineSpan(duration), 0, duration);
}
