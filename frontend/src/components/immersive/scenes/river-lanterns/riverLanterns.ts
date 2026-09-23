import {sceneRandom, sceneSeed, smoothWaveform} from '../shared/scenery';
import {dominantArtworkHue} from '../shared/artworkPalette';

export const RIVER_PALETTE = {
    sky: '#0a1525', haze: '#344350', water: '#142a39', deep: '#080f1d',
    bank: '#09151c', paper: '#ffc989', accent: '#efbb85',
};

export function riverPaletteFromPixels(pixels: Uint8ClampedArray): typeof RIVER_PALETTE {
    const hue = dominantArtworkHue(pixels);
    return hue === null ? RIVER_PALETTE : {
        ...RIVER_PALETTE,
        haze: `hsl(${hue} 14% 26%)`,
        accent: `hsl(${hue} 36% 75%)`,
    };
}

export function createRiverLanterns(key: string, peaks: Uint8Array | null, palette = RIVER_PALETTE) {
    const seed = sceneSeed(key);
    const samples = Array.from({length: 96}, (_, i) => {
        if (!peaks?.length) return 0;
        const start = Math.floor(i * peaks.length / 96);
        const end = Math.max(start + 1, Math.floor((i + 1) * peaks.length / 96));
        let sum = 0;
        for (let j = start; j < end; j++) sum += peaks[j];
        return Math.round(sum / (end - start));
    });
    const lanterns = Array.from({length: 30}, (_, i) => ({
        phase: (i + sceneRandom(seed, i * 7)) / 30,
        lane: (sceneRandom(seed, i * 7 + 1) - 0.5) * 1.65,
        speed: 0.8 + sceneRandom(seed, i * 7 + 2) * 0.4,
        size: 0.8 + sceneRandom(seed, i * 7 + 3) * 0.4,
        warmth: sceneRandom(seed, i * 7 + 4),
        turn: sceneRandom(seed, i * 7 + 5) * Math.PI * 2,
    }));
    return {seed, palette, lanterns, shimmer: smoothWaveform(Uint8Array.from(samples), 5)};
}

export type RiverLanterns = ReturnType<typeof createRiverLanterns>;
export type Lantern = RiverLanterns['lanterns'][number];

export function projectLantern(lantern: Lantern, time: number, width: number, height: number) {
    const phase = ((lantern.phase + time * lantern.speed / 190) % 1 + 1) % 1;
    const depth = Math.pow(phase, 2.6);
    const scale = Math.min(Math.sqrt(width / 1100), height / 760);
    const y = height * (0.285 + depth * 0.94);
    const x = width * (0.5 + lantern.lane * (0.025 + depth * 0.7))
        + Math.sin(time * 0.13 + lantern.turn) * 12 * depth * scale;
    const size = (3 + depth * 65) * lantern.size * scale;
    const opacity = Math.min(1, phase * 18);
    return {x, y, size, depth, opacity};
}

// The scene uses ambient time; seeking stays on the player's timeline.
export const riverSpan = () => 120;
export const riverSeek = (time: number) => time;
