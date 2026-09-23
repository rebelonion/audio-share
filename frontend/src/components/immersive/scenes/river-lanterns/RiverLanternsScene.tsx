import {useEffect, useMemo, useRef} from 'react';
import type {SceneProps} from '../types';
import SceneCanvas from '../shared/SceneCanvas';
import {useArtworkPalette} from '../shared/artworkPalette';
import {createRiverLanterns, RIVER_PALETTE, riverPaletteFromPixels, riverSeek, riverSpan} from './riverLanterns';
import {drawRiverLanterns} from './drawRiverLanterns';
import './riverLanterns.css';

export default function RiverLanternsScene({thumbnail, peaks, onPaletteChange, ...playback}: SceneProps) {
    const palette = useArtworkPalette(thumbnail, RIVER_PALETTE, riverPaletteFromPixels);
    const sceneryKey = useRef(playback.trackKey).current;
    const data = useMemo(() => createRiverLanterns(sceneryKey, peaks, palette), [sceneryKey, peaks, palette]);
    useEffect(() => {
        onPaletteChange?.({
            background: palette.deep, control: palette.sky, hover: palette.water,
            border: palette.haze, accent: palette.accent,
        });
    }, [palette, onPaletteChange]);
    return <SceneCanvas {...playback} canSeek={false} data={data} renderFrame={drawRiverLanterns}
        travelSpan={riverSpan} seekFromDrag={riverSeek} className="river-lanterns-canvas" />;
}
