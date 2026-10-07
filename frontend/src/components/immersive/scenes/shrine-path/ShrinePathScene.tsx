import {useCallback, useEffect, useMemo, useRef} from 'react';
import type {SceneProps} from '../types';
import SceneCanvas from '../shared/SceneCanvas';
import {useArtworkPalette} from '../shared/artworkPalette';
import {useTimeOfYear} from '@/hooks/useSeasons';
import {createShrinePath, shrineSeek, shrineSpan} from './shrinePath';
import {SHRINE_SEASON_PALETTES, shrinePaletteFromPixels} from './palette';
import {drawShrinePath} from './drawShrinePath';

export default function ShrinePathScene({thumbnail, peaks, onPaletteChange, ...playback}: SceneProps) {
    const season = useTimeOfYear();
    const basePalette = SHRINE_SEASON_PALETTES[season];
    const fromPixels = useCallback((pixels: Uint8ClampedArray) => shrinePaletteFromPixels(pixels, season), [season]);
    const palette = useArtworkPalette(thumbnail, basePalette, fromPixels);
    const sceneryKey = useRef(playback.trackKey).current;
    const scene = useMemo(() => createShrinePath(sceneryKey, peaks, palette, season), [sceneryKey, peaks, palette, season]);
    useEffect(() => {
        onPaletteChange?.({
            background: palette.pine,
            control: palette.forest,
            hover: palette.ground,
            border: palette.hill,
            accent: palette.accent,
        });
    }, [palette, onPaletteChange]);
    return <SceneCanvas {...playback} data={scene} renderFrame={drawShrinePath} travelSpan={shrineSpan} seekFromDrag={shrineSeek} className="shrine-path-canvas" />;
}
