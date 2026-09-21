import {clamp} from '@/lib/utils';
import {sceneSeed, smoothWaveform} from '../shared/scenery';
import {NIGHT_TRAIN_PALETTE, type NightTrainPalette} from './palette';

export interface NightTrain {
    seed: number;
    hills: number[];
    skyline: number[];
    palette: NightTrainPalette;
}

export function createNightTrain(trackKey: string, waveform: Uint8Array | null, palette = NIGHT_TRAIN_PALETTE): NightTrain {
    const seed = sceneSeed(trackKey);
    const peaks = waveform?.length ? waveform : new Uint8Array(2);
    return {seed, hills: smoothWaveform(peaks, 7), skyline: smoothWaveform(peaks, 1), palette};
}

// One travel unit of countryside represents this much of the recording.
export function trainSpan(duration: number): number {
    return Math.min(duration || 120, clamp(duration * 0.1, 40, 160));
}

export function trainSeek(time: number, deltaX: number, travelDistance: number, duration: number): number {
    if (travelDistance <= 0 || duration <= 0) return time;
    return clamp(time - deltaX / travelDistance * trainSpan(duration), 0, duration);
}
