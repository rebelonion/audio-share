import {clamp} from '@/lib/utils';
import type {SceneLayer} from '../types';

// CSS pixels per travel unit. Viewport width only controls how much world is visible.
export const SCENE_TRAVEL_DISTANCE = 1440;

export function sampleSceneWaveform<T>(
    layers: SceneLayer<T>[], samples: (scene: T) => number[],
    span: (duration: number) => number, offset: number, speed = 1,
): number {
    return layers.reduce((sum, layer) => {
        const position = (layer.time * speed + offset * span(layer.duration)) / (layer.duration || 120);
        return sum + sampleWaveform(samples(layer.data), position) * layer.weight;
    }, 0);
}

export function sceneSeed(key: string): number {
    let seed = 2166136261;
    for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    return seed >>> 0;
}

export function sceneRandom(seed: number, index: number): number {
    let value = Math.imul(seed ^ index, 374761393);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function smoothWaveform(peaks: Uint8Array, radius: number): number[] {
    return Array.from(peaks, (_, index) => {
        let sum = 0;
        let weight = 0;
        for (let offset = -radius; offset <= radius; offset++) {
            const influence = radius + 1 - Math.abs(offset);
            sum += peaks[clamp(index + offset, 0, peaks.length - 1)] / 255 * influence;
            weight += influence;
        }
        return sum / weight;
    });
}

export function sampleWaveform(samples: number[], progress: number): number {
    if (!samples.length) return 0;
    const position = clamp(progress, 0, 1) * (samples.length - 1);
    const index = Math.floor(position);
    const blend = (1 - Math.cos((position - index) * Math.PI)) / 2;
    return samples[index] * (1 - blend) + samples[Math.min(index + 1, samples.length - 1)] * blend;
}
