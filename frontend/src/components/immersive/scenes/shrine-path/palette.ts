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
    roof: '#293b3d',
    roofLight: '#637274',
    timber: '#60463a',
    vermilion: '#b95840',
    lantern: '#f0ca87',
    accent: '#d1a69a',
};

export function shrinePaletteFromPixels(pixels: Uint8ClampedArray): ShrinePalette {
    const hue = dominantArtworkHue(pixels);
    if (hue === null) return SHRINE_PALETTE;
    return {
        ...SHRINE_PALETTE,
        haze: `hsl(${hue} 15% 52%)`,
        mountain: `hsl(${(hue + 25) % 360} 14% 47%)`,
        horizon: `hsl(${hue} 24% 71%)`,
        accent: `hsl(${hue} 38% 72%)`,
    };
}
