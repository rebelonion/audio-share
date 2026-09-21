import {lazy} from 'react';
import {Mountain} from 'lucide-react';
import type {SceneDefinition} from '../types';

export const travelerScene: SceneDefinition = {
    id: 'traveler',
    label: 'Traveler',
    icon: Mountain,
    Component: lazy(() => import('./TravelerScene')),
    seekHint: 'Drag the landscape to explore',
    idleHint: 'Your journey starts here',
    waveformCaption: 'A landscape shaped by this recording',
    fallbackCaption: 'Scenic terrain · waveform unavailable',
};
