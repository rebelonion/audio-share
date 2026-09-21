import {dominantArtworkHue} from '../shared/artworkPalette';

export interface NightTrainPalette {
    midnight: string;
    sky: string;
    twilight: string;
    far: string;
    hill: string;
    forest: string;
    lake: string;
    lakeDeep: string;
    shore: string;
    carriage: string;
    amber: string;
    accent: string;
    light: string;
    upholstery: string;
    upholsteryLight: string;
}

export const NIGHT_TRAIN_PALETTE: NightTrainPalette = {
    midnight: '#101b2c',
    sky: '#2b4053',
    twilight: '#4e6372',
    far: '#344a5b',
    hill: '#263f49',
    forest: '#162c31',
    lake: '#243d48',
    lakeDeep: '#12252e',
    shore: '#172f3a',
    carriage: '#211e22',
    amber: '#e9bb7d',
    accent: '#b4a5bf',
    light: '#baa0cc',
    upholstery: '#443641',
    upholsteryLight: '#57424b',
};

export function trainPaletteFromPixels(pixels: Uint8ClampedArray): NightTrainPalette {
    const hue = dominantArtworkHue(pixels);
    if (hue === null) return NIGHT_TRAIN_PALETTE;
    return {
        ...NIGHT_TRAIN_PALETTE,
        accent: `hsl(${hue} 38% 70%)`,
        light: `hsl(${hue} 52% 64%)`,
        upholstery: `hsl(${hue} 30% 24%)`,
        upholsteryLight: `hsl(${hue} 34% 32%)`,
    };
}
