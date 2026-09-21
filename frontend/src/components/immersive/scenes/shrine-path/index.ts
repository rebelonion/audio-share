import {lazy} from 'react';
import {createLucideIcon} from 'lucide-react';
import type {SceneDefinition} from '../types';

const ToriiGate = createLucideIcon('ToriiGate', [
    ['path', {d: 'M2 4q10 4 20 0M3 7q9 3 18 0M4 12h16M7 8 6 21M17 8l1 13M12 9v3', key: 'gate'}],
]);

export const shrinePathScene: SceneDefinition = {
    id: 'shrine-path',
    label: 'Shrine path',
    icon: ToriiGate,
    Component: lazy(() => import('./ShrinePathScene')),
    seekHint: 'Drag the path to travel through the recording',
    idleHint: 'An evening on the shrine path',
    waveformCaption: 'Mountain ridges shaped by this recording',
    fallbackCaption: 'Torii gates and lanterns at dusk · waveform unavailable',
};
