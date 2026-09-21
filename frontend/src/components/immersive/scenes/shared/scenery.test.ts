import {describe, expect, it} from 'vitest';
import {sampleSceneWaveform, sampleWaveform, sceneRandom, sceneSeed, smoothWaveform} from './scenery';

describe('scene waveforms', () => {
    it('preserves silence and constant amplitude when smoothing', () => {
        expect(smoothWaveform(new Uint8Array(8), 4)).toEqual(Array(8).fill(0));
        expect(smoothWaveform(new Uint8Array(8).fill(255), 4)).toEqual(Array(8).fill(1));
        expect(sampleWaveform([], 0.5)).toBe(0);
        expect(sampleWaveform([0.4], 0.7)).toBe(0.4);
    });

    it('keeps a loud passage at its recording position while softening its edges', () => {
        const terrain = smoothWaveform(Uint8Array.from([0, 0, 0, 255, 0, 0, 0]), 1);
        expect(sampleWaveform(terrain, 0.5)).toBe(0.5);
        expect(sampleWaveform(terrain, 0)).toBe(0);
        expect(sampleWaveform(terrain, 1)).toBe(0);
        expect(sampleWaveform(terrain, 0.4)).toBeGreaterThan(0);
        expect(sampleWaveform(terrain, -1)).toBe(terrain[0]);
        expect(sampleWaveform(terrain, 2)).toBe(terrain[6]);
    });

    it('recreates decorations for a track independently of visit order', () => {
        const first = [-5, 0, 27, 200].map(cell => sceneRandom(sceneSeed('track-a'), cell));
        sceneRandom(sceneSeed('track-b'), 100);
        expect([-5, 0, 27, 200].map(cell => sceneRandom(sceneSeed('track-a'), cell))).toEqual(first);
        expect(first.every(value => value >= 0 && value < 1)).toBe(true);
        expect(sceneSeed('track-a')).not.toBe(sceneSeed('track-b'));
    });

    it('blends each track at its own position and duration', () => {
        const layers = [
            {data: [0, 1, 0], time: 50, duration: 100, weight: 0.25},
            {data: [1, 0, 1], time: 100, duration: 200, weight: 0.75},
        ];
        expect(sampleSceneWaveform(layers, samples => samples, () => 40, 0)).toBe(0.25);
        expect(sampleSceneWaveform(layers, samples => samples, () => 40, 0, 0)).toBe(0.75);
        expect(sampleSceneWaveform(layers, samples => samples, () => 40, -5)).toBe(0.75);
    });
});
