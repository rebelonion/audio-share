import {lazy} from 'react';
import {Sunset} from 'lucide-react';
import type {SceneDefinition} from '../types';

export const desertDuskScene: SceneDefinition = {
    id: 'desert-dusk',
    label: 'Desert at dusk',
    icon: Sunset,
    Component: lazy(() => import('./DesertDuskScene')),
    seekHint: 'Drag the dunes to travel through the recording',
    idleHint: 'An evening among the dunes',
    waveformCaption: 'Distant dunes shaped by this recording',
    fallbackCaption: 'Wind, sand, and the last light of day',
};
