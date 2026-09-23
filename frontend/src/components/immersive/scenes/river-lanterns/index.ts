import {lazy} from 'react';
import {Lamp} from 'lucide-react';
import type {SceneDefinition} from '../types';

export const riverLanternsScene: SceneDefinition = {
    id: 'river-lanterns',
    label: 'River lanterns',
    icon: Lamp,
    Component: lazy(() => import('./RiverLanternsScene')),
    seekHint: 'Use the timeline to move through the recording',
    idleHint: 'Lanterns drifting down a quiet river',
    waveformCaption: 'The recording softly shapes the shimmer on the water',
    fallbackCaption: 'Paper lanterns and ribbons of reflected light',
};
