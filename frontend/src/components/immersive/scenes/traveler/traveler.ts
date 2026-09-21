import {clamp} from '@/lib/utils';
import {dominantArtworkHue} from '../shared/artworkPalette';
import {sceneSeed, smoothWaveform} from '../shared/scenery';

export interface Traveler {
    seed: number;
    terrain: number[][];
    palette: TravelerPalette;
}

export function createTraveler(sceneryKey: string, waveform: Uint8Array | null, palette = DUSK_PALETTE): Traveler {
    const peaks = waveform?.length ? waveform : new Uint8Array(2);
    return {seed: sceneSeed(sceneryKey), terrain: [8, 4, 2].map(radius => smoothWaveform(peaks, radius)), palette};
}

// Keep a useful walking pace for both short clips and long recordings.
export function travelerSpan(duration: number): number {
    return Math.min(duration || 120, clamp(duration * 0.12, 32, 180));
}

export function travelerSeek(startTime: number, deltaX: number, travelDistance: number, duration: number): number {
    if (travelDistance <= 0 || duration <= 0) return startTime;
    return clamp(startTime - deltaX / travelDistance * travelerSpan(duration), 0, duration);
}

export interface TravelerPalette {
    sky: string;
    haze: string;
    horizon: string;
    far: string;
    middle: string;
    ground: string;
    foreground: string;
    light: string;
}

export const DUSK_PALETTE: TravelerPalette = {
    sky: '#17243c',
    haze: '#777e96',
    horizon: '#dca997',
    far: '#77788e',
    middle: '#485a70',
    ground: '#233f49',
    foreground: '#132b32',
    light: '#ffe0a6',
};

export function paletteFromPixels(pixels: Uint8ClampedArray): TravelerPalette {
    const hue = dominantArtworkHue(pixels);
    if (hue === null) return DUSK_PALETTE;
    const cool = (hue + 35) % 360;
    return {
        sky: `hsl(${cool} 30% 17%)`,
        haze: `hsl(${hue} 18% 51%)`,
        horizon: `hsl(${(hue + 310) % 360} 35% 73%)`,
        far: `hsl(${hue} 16% 49%)`,
        middle: `hsl(${cool} 24% 34%)`,
        ground: `hsl(${cool} 30% 22%)`,
        foreground: `hsl(${cool} 35% 13%)`,
        light: DUSK_PALETTE.light,
    };
}
