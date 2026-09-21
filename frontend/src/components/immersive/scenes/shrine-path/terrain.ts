import {SCENE_TRAVEL_DISTANCE, sampleSceneWaveform} from '../shared/scenery';
import type {SceneFrame} from '../types';
import {shrineSpan, type ShrinePath} from './shrinePath';

export const SHRINE_RIDGES = [
    {speed: 0.1, base: 0.59, height: 0.17, color: 'mountain', parallaxX: 3, parallaxY: 1},
    {speed: 0.22, base: 0.64, height: 0.12, color: 'hill', parallaxX: 7, parallaxY: 2},
    {speed: 0.36, base: 0.655, height: 0, color: 'forest', parallaxX: 11, parallaxY: 3},
] as const;

export interface RidgeProfile {
    start: number;
    step: number;
    heights: number[];
}

export function createRidgeProfile(frame: SceneFrame<ShrinePath>, depth: number, scale: number): RidgeProfile {
    const {width: w, height: h, travel, pointerX, pointerY, layers} = frame;
    const ridge = SHRINE_RIDGES[depth];
    const margin = 160 * scale;
    const step = 5;
    const camera = travel * SCENE_TRAVEL_DISTANCE * ridge.speed;
    // Keep terrain samples fixed in the world so scrolling cannot shift a foundation's height.
    const worldStart = Math.floor((camera - margin) / step) * step;
    const heights = Array.from({length: Math.ceil((w + margin * 2) / step) + 2}, (_, i) => {
        const world = worldStart + i * step;
        const x = world - camera;
        // The village needs stable ground; the two distant ridges carry the waveform.
        const amplitude = ridge.height === 0 ? 0 : sampleSceneWaveform(layers, data => depth === 0 ? data.ridges : data.hills, shrineSpan, (x - w * 0.5) / SCENE_TRAVEL_DISTANCE / ridge.speed);
        const contour = Math.sin(world / (230 * scale) + depth * 1.8) * h * 0.025 + Math.sin(world / (97 * scale) + depth) * h * 0.012;
        return h * ridge.base - amplitude * h * ridge.height + contour + pointerY * ridge.parallaxY;
    });
    return {start: worldStart - camera + pointerX * ridge.parallaxX, step, heights};
}

// A level foundation must clear the lowest terrain point across its whole footprint.
export function ridgeBaseAt(profile: RidgeProfile, x: number, halfWidth = 0): number {
    const {start, step, heights} = profile;
    const positionAt = (px: number) => Math.max(0, Math.min(heights.length - 1, (px - start) / step));
    const left = positionAt(x - halfWidth);
    const right = positionAt(x + halfWidth);
    const heightAt = (position: number) => {
        const index = Math.floor(position);
        return heights[index] + (heights[Math.min(index + 1, heights.length - 1)] - heights[index]) * (position - index);
    };
    let base = Math.max(heightAt(left), heightAt(right));
    for (let i = Math.ceil(left); i <= Math.floor(right); i++) base = Math.max(base, heights[i]);
    return base;
}
