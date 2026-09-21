import {useEffect, useMemo, useRef} from 'react';
import type {SceneProps} from '../types';
import SceneCanvas from '../shared/SceneCanvas';
import {useArtworkPalette} from '../shared/artworkPalette';
import {createUnderwaterDrift, underwaterSeek, underwaterSpan} from './underwaterDrift';
import {UNDERWATER_PALETTE, underwaterPaletteFromPixels} from './palette';
import {drawUnderwaterDrift} from './drawUnderwaterDrift';

export default function UnderwaterDriftScene({thumbnail, peaks, onPaletteChange, ...playback}: SceneProps) {
    const palette = useArtworkPalette(thumbnail, UNDERWATER_PALETTE, underwaterPaletteFromPixels);
    const sceneryKey = useRef(playback.trackKey).current;
    const scene = useMemo(() => createUnderwaterDrift(sceneryKey, peaks, palette), [sceneryKey, peaks, palette]);
    useEffect(() => {
        onPaletteChange?.({
            background: palette.abyss, control: palette.deep,
            hover: palette.groundShadow, border: palette.stoneShadow, accent: palette.accent,
        });
    }, [palette, onPaletteChange]);
    return <SceneCanvas {...playback} data={scene} renderFrame={drawUnderwaterDrift} travelSpan={underwaterSpan} seekFromDrag={underwaterSeek} className="underwater-drift-canvas" />;
}
