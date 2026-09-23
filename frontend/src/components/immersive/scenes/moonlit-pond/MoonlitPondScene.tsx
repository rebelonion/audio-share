import {useEffect, useMemo, useRef} from 'react';
import type {SceneProps} from '../types';
import SceneCanvas from '../shared/SceneCanvas';
import {useArtworkPalette} from '../shared/artworkPalette';
import {createPond, POND_PALETTE, pondPaletteFromPixels, pondSeek, pondSpan} from './pond';
import {createPondSceneRenderer} from './pondRenderer';
import './moonlitPond.css';

export default function MoonlitPondScene({thumbnail, peaks, onPaletteChange, ...playback}: SceneProps) {
    const palette = useArtworkPalette(thumbnail, POND_PALETTE, pondPaletteFromPixels);
    const sceneryKey = useRef(playback.trackKey).current;
    const data = useMemo(() => createPond(sceneryKey, peaks, palette), [sceneryKey, peaks, palette]);
    const renderer = useMemo(createPondSceneRenderer, []);
    useEffect(() => () => renderer.dispose(), [renderer]);
    useEffect(() => {
        onPaletteChange?.({background: palette.deep, control: palette.edge, hover: palette.water, border: palette.leaf, accent: palette.accent});
    }, [palette, onPaletteChange]);
    return <SceneCanvas {...playback} canSeek={false} data={data} renderFrame={renderer.draw} renderBitmapFrame={renderer.drawBitmap}
        travelSpan={pondSpan} seekFromDrag={pondSeek} className="moonlit-pond-canvas" />;
}
