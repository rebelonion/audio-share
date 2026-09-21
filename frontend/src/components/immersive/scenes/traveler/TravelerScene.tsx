import {SCENE_TRAVEL_DISTANCE} from '../shared/scenery';
import {useEffect, useMemo, useRef} from 'react';
import {clamp} from '@/lib/utils';
import {useArtworkPalette} from '../shared/artworkPalette';
import type {SceneFrame, SceneProps} from '../types';
import SceneCanvas from '../shared/SceneCanvas';
import {createTraveler, DUSK_PALETTE, travelerSeek, travelerSpan, paletteFromPixels, type Traveler} from './traveler';
import {drawTraveler} from './drawTraveler';

export default function TravelerScene({thumbnail, peaks, onPaletteChange, ...playback}: SceneProps) {
    const palette = useArtworkPalette(thumbnail, DUSK_PALETTE, paletteFromPixels);
    const sceneryKey = useRef(playback.trackKey).current;
    const scene = useMemo(() => createTraveler(sceneryKey, peaks, palette), [sceneryKey, peaks, palette]);
    const renderTraveler = useMemo(() => {
        let previousTravel = 0;
        let walkPhase = 0;
        return (ctx: CanvasRenderingContext2D, scene: Traveler, frame: SceneFrame<Traveler>) => {
            const scale = clamp(frame.height / 760, 0.65, 1.4);
            const stride = clamp(SCENE_TRAVEL_DISTANCE / frame.travelSpan / scale * 1.15, 20, 32);
            walkPhase += (frame.travel - previousTravel) * SCENE_TRAVEL_DISTANCE / scale / stride;
            previousTravel = frame.travel;
            drawTraveler(ctx, scene, {...frame, walking: frame.moving, walkPhase, stride});
        };
    }, []);

    useEffect(() => {
        onPaletteChange?.({
            background: palette.foreground,
            control: palette.ground,
            hover: palette.middle,
            border: palette.haze,
            accent: palette.horizon,
        });
    }, [palette, onPaletteChange]);

    return <SceneCanvas {...playback} data={scene} renderFrame={renderTraveler} travelSpan={travelerSpan} seekFromDrag={travelerSeek} className="traveler-canvas" />;
}
