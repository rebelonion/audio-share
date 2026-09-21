import {lazy} from 'react';
import {TrainFront} from 'lucide-react';
import type {SceneDefinition} from '../types';

export const nightTrainScene: SceneDefinition = {
    id: 'night-train',
    label: 'Night train',
    icon: TrainFront,
    Component: lazy(() => import('./NightTrainScene')),
    seekHint: 'Drag the window to travel through the recording',
    idleHint: 'Take a window seat',
    waveformCaption: 'Hills and a skyline shaped by this recording',
    fallbackCaption: 'Countryside after dark · waveform unavailable',
};
