import {useEffect, useMemo, useRef} from 'react';
import type {SceneProps} from '../types';
import SceneCanvas from '../shared/SceneCanvas';
import {useArtworkPalette} from '../shared/artworkPalette';
import {createDesertDusk, desertSeek, desertSpan} from './desertDusk';
import {DESERT_PALETTE, desertPaletteFromPixels} from './palette';
import {drawDesertDusk} from './drawDesertDusk';

export default function DesertDuskScene({thumbnail, peaks, onPaletteChange, ...playback}: SceneProps) {
    const palette = useArtworkPalette(thumbnail, DESERT_PALETTE, desertPaletteFromPixels);
    const sceneryKey = useRef(playback.trackKey).current;
    const scene = useMemo(() => createDesertDusk(sceneryKey, peaks, palette), [sceneryKey, peaks, palette]);
    useEffect(() => {
        onPaletteChange?.({
            background: palette.nearShadow, control: palette.near,
            hover: palette.groundShadow, border: palette.stoneShadow, accent: palette.accent,
        });
    }, [palette, onPaletteChange]);
    return <SceneCanvas {...playback} data={scene} renderFrame={drawDesertDusk} travelSpan={desertSpan} seekFromDrag={desertSeek} className="desert-dusk-canvas" />;
}
