import {lazy} from 'react';
import {Moon} from 'lucide-react';
import type {SceneDefinition} from '../types';

export const moonlitPondScene: SceneDefinition = {
    id: 'moonlit-pond',
    label: 'Moonlit pond',
    icon: Moon,
    Component: lazy(() => import('./MoonlitPondScene')),
    seekHint: 'Use the timeline to move through the recording',
    idleHint: 'Koi beneath a moonlit surface',
    waveformCaption: 'A quiet shimmer from the recording, beneath the rain',
    fallbackCaption: 'Moonlight, lily pads, and passing rain',
};
