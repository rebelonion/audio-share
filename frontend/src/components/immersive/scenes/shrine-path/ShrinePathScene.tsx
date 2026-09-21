import {useEffect, useMemo, useRef} from 'react';
import type {SceneProps} from '../types';
import SceneCanvas from '../shared/SceneCanvas';
import {useArtworkPalette} from '../shared/artworkPalette';
import {createShrinePath, shrineSeek, shrineSpan} from './shrinePath';
import {SHRINE_PALETTE, shrinePaletteFromPixels} from './palette';
import {drawShrinePath} from './drawShrinePath';

export default function ShrinePathScene({thumbnail, peaks, onPaletteChange, ...playback}: SceneProps) {
    const palette = useArtworkPalette(thumbnail, SHRINE_PALETTE, shrinePaletteFromPixels);
    const sceneryKey = useRef(playback.trackKey).current;
    const scene = useMemo(() => createShrinePath(sceneryKey, peaks, palette), [sceneryKey, peaks, palette]);
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
