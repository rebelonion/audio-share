import {dominantArtworkHue} from '../shared/artworkPalette';

export const DESERT_PALETTE = {
    sky: '#292c48', haze: '#956a83', horizon: '#efad79', sun: '#ffdaa0',
    far: '#bb8d8e', farShadow: '#946e7e', sand: '#ce936a', sandShadow: '#a76655',
    ground: '#9b6047', groundShadow: '#68433e', near: '#593d3b', nearShadow: '#332c37',
    stone: '#b18466', stoneShadow: '#77513f', silhouette: '#513c3c', accent: '#eac597',
};

export type DesertPalette = typeof DESERT_PALETTE;

export function desertPaletteFromPixels(pixels: Uint8ClampedArray): DesertPalette {
    const hue = dominantArtworkHue(pixels);
    if (hue === null) return DESERT_PALETTE;
    return {
        ...DESERT_PALETTE,
        haze: `hsl(${hue} 20% 51%)`,
        far: `hsl(${hue} 22% 63%)`,
        farShadow: `hsl(${hue} 19% 47%)`,
        accent: `hsl(${hue} 42% 77%)`,
    };
}
