import type {ComponentType} from 'react';
import type {LucideIcon} from 'lucide-react';

export interface ScenePalette {
    background: string;
    control: string;
    hover: string;
    border: string;
    accent: string;
}

export interface ScenePlaybackProps {
    readAudioLevel?: () => number;
    trackKey: string;
    currentTime: number;
    seekVersion: number;
    duration: number;
    isPlaying: boolean;
    isLoading: boolean;
    motion: boolean;
    canSeek: boolean;
    previewTime: number | null;
    onPreview: (time: number | null) => void;
    onSeek: (time: number) => void;
}

export interface SceneProps extends ScenePlaybackProps {
    thumbnail: string | null;
    peaks: Uint8Array | null;
    onPaletteChange?: (palette: ScenePalette) => void;
}

export interface SceneLayer<T> {
    data: T;
    time: number;
    duration: number;
    weight: number;
}

export interface SceneFrame<T> {
    audioLevel?: number;
    width: number;
    height: number;
    time: number;
    duration: number;
    ambientTime: number;
    motionEnabled?: boolean;
    moving: boolean;
    pointerX: number;
    pointerY: number;
    travel: number;
    travelSpan: number;
    layers: SceneLayer<T>[];
}

export interface SceneDefinition {
    id: string;
    label: string;
    icon: LucideIcon;
    Component: ComponentType<SceneProps>;
    seekHint: string;
    idleHint: string;
    waveformCaption: string;
    fallbackCaption: string;
}
