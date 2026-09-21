import {useEffect, useMemo, useRef} from 'react';
import type {SceneProps} from '../types';
import SceneCanvas from '../shared/SceneCanvas';
import {createNightTrain, trainSeek, trainSpan} from './nightTrain';
import {NIGHT_TRAIN_PALETTE, trainPaletteFromPixels} from './palette';
import {useArtworkPalette} from '../shared/artworkPalette';
import {drawNightTrain} from './drawNightTrain';

export default function NightTrainScene({thumbnail, peaks, onPaletteChange, ...playback}: SceneProps) {
    const palette = useArtworkPalette(thumbnail, NIGHT_TRAIN_PALETTE, trainPaletteFromPixels);
    const sceneryKey = useRef(playback.trackKey).current;
    const scene = useMemo(() => createNightTrain(sceneryKey, peaks, palette), [sceneryKey, peaks, palette]);
    useEffect(() => {
        onPaletteChange?.({
            background: palette.midnight,
            control: palette.hill,
            hover: palette.forest,
            border: palette.twilight,
            accent: palette.accent,
        });
    }, [palette, onPaletteChange]);
    return <SceneCanvas {...playback} data={scene} renderFrame={drawNightTrain} travelSpan={trainSpan} seekFromDrag={trainSeek} className="night-train-canvas" />;
}
