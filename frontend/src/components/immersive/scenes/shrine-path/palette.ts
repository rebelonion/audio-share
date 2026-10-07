import type {TimeOfYear} from '@/lib/seasons';
import {dominantArtworkHue} from '../shared/artworkPalette';

export interface ShrinePalette {
    sky: string;
    haze: string;
    horizon: string;
    mountain: string;
    hill: string;
    forest: string;
    pine: string;
    ground: string;
    stone: string;
    path: string;
    road: string;
    roadDeep: string;
    roof: string;
    roofLight: string;
    timber: string;
    vermilion: string;
    lantern: string;
    accent: string;
}

export const SHRINE_PALETTE: ShrinePalette = {
    sky: '#24394b',
    haze: '#85818a',
    horizon: '#cfb098',
    mountain: '#747e87',
    hill: '#53696a',
    forest: '#354f48',
    pine: '#203c35',
    ground: '#3a4d42',
    stone: '#727870',
    path: '#85867a',
    road: '#72786b',
    roadDeep: '#495c50',
    roof: '#293b3d',
    roofLight: '#637274',
    timber: '#60463a',
    vermilion: '#b95840',
    lantern: '#f0ca87',
    accent: '#d1a69a',
};

// Architecture keeps its colors all year; the landscape and light shift with the season.
export const SHRINE_SEASON_PALETTES: Record<TimeOfYear, ShrinePalette> = {
    spring: SHRINE_PALETTE,
    summer: {
        ...SHRINE_PALETTE,
        sky: '#1b3144', haze: '#6c8792', horizon: '#b9c6b0',
        mountain: '#66777f', hill: '#476a5c', forest: '#2f5443', pine: '#1d3a31',
        ground: '#355440', path: '#8a8b7c', road: '#6d7568', roadDeep: '#45594d', accent: '#b6cfae',
    },
    autumn: {
        ...SHRINE_PALETTE,
        sky: '#2d3147', haze: '#9b7e78', horizon: '#e2a878',
        mountain: '#7c7284', hill: '#6f5c4f', forest: '#5a4f38', pine: '#2f3d30',
        ground: '#5c4a35', path: '#8f8572', road: '#7a715f', roadDeep: '#4f4a3b', accent: '#e4a56f',
    },
    winter: {
        ...SHRINE_PALETTE,
        sky: '#36465a', haze: '#99a3ae', horizon: '#dad5cf',
        mountain: '#aab2bc', hill: '#8c98a1', forest: '#5f6f73', pine: '#253b37',
        ground: '#d6dadb', path: '#b9bec0', road: '#cfd4d6', roadDeep: '#9ea8ae', stone: '#8a9094',
        roofLight: '#c9d1d6', accent: '#c7d3dc',
    },
};

// Artwork lends its hue to the distant landscape, but each season sets how saturated and how
// light that tint may be, so winter stays pale and autumn stays warm whatever the cover looks like.
type Tint = [saturation: number, lightness: number];
const SHRINE_SEASON_TINTS: Record<TimeOfYear, {haze: Tint; mountain: Tint; horizon: Tint; accent: Tint}> = {
    spring: {haze: [15, 52], mountain: [14, 47], horizon: [24, 71], accent: [38, 72]},
    summer: {haze: [18, 50], mountain: [16, 45], horizon: [20, 74], accent: [30, 74]},
    autumn: {haze: [20, 55], mountain: [14, 48], horizon: [36, 68], accent: [45, 70]},
    winter: {haze: [8, 66], mountain: [8, 70], horizon: [12, 84], accent: [18, 80]},
};

export function shrinePaletteFromPixels(pixels: Uint8ClampedArray, season: TimeOfYear = 'spring'): ShrinePalette {
    const base = SHRINE_SEASON_PALETTES[season];
    const hue = dominantArtworkHue(pixels);
    if (hue === null) return base;
    const tint = SHRINE_SEASON_TINTS[season];
    const hsl = ([saturation, lightness]: Tint, shift = 0) => `hsl(${(hue + shift) % 360} ${saturation}% ${lightness}%)`;
    return {
        ...base,
        haze: hsl(tint.haze),
        mountain: hsl(tint.mountain, 25),
        horizon: hsl(tint.horizon),
        accent: hsl(tint.accent),
    };
}
