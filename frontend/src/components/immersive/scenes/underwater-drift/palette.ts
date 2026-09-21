import {dominantArtworkHue} from '../shared/artworkPalette';

export const UNDERWATER_PALETTE = {
    surface: '#286775', water: '#123f50', deep: '#071f30', abyss: '#061825',
    light: '#afd3c4', distant: '#205263', ridge: '#193f50',
    ground: '#254a50', groundShadow: '#16363e', sand: '#66817a',
    stone: '#547372', stoneShadow: '#2e5057',
    kelp: '#315e54', kelpLight: '#68896b', near: '#102f35',
    coral: '#bd838e', coralShadow: '#765e79', glow: '#aedbd5', accent: '#b3d8ca',
};

export type UnderwaterPalette = typeof UNDERWATER_PALETTE;

export function underwaterPaletteFromPixels(pixels: Uint8ClampedArray): UnderwaterPalette {
    const hue = dominantArtworkHue(pixels);
    if (hue === null) return UNDERWATER_PALETTE;
    return {
        ...UNDERWATER_PALETTE,
        coral: `hsl(${hue} 33% 65%)`,
        coralShadow: `hsl(${hue} 21% 39%)`,
        glow: `hsl(${hue} 38% 78%)`,
        accent: `hsl(${hue} 35% 76%)`,
    };
}
