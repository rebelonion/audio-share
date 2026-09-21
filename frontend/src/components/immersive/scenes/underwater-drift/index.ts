import {lazy} from 'react';
import {Waves} from 'lucide-react';
import type {SceneDefinition} from '../types';

export const underwaterDriftScene: SceneDefinition = {
    id: 'underwater-drift',
    label: 'Underwater drift',
    icon: Waves,
    Component: lazy(() => import('./UnderwaterDriftScene')),
    seekHint: 'Drag the water to travel through the recording',
    idleHint: 'A quiet journey beneath the surface',
    waveformCaption: 'Distant seabed ridges shaped by this recording',
    fallbackCaption: 'Kelp, coral, and light from above',
};
