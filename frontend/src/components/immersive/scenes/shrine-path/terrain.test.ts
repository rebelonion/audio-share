import {expect, it} from 'vitest';
import {SCENE_TRAVEL_DISTANCE} from '../shared/scenery';
import type {SceneFrame} from '../types';
import {createShrinePath, type ShrinePath} from './shrinePath';
import {createRidgeProfile, ridgeBaseAt, SHRINE_RIDGES} from './terrain';

it('supports the whole foundation, including a dip between its corners', () => {
    const profile = {start: 0, step: 5, heights: [20, 30, 80, 40, 20]};
    expect(ridgeBaseAt(profile, 10, 10)).toBe(80);
    expect(ridgeBaseAt(profile, 2.5)).toBe(25);
    expect(ridgeBaseAt(profile, 2.5, 1)).toBe(27);
});

it('keeps a village location at the same height as it scrolls and new waveforms arrive', () => {
    const flat = createShrinePath('village', null);
    const loud = createShrinePath('village', new Uint8Array(512).fill(255));
    const frame: SceneFrame<ShrinePath> = {
        width: 1440, height: 900, travel: 0, pointerX: 0, pointerY: 0,
        time: 60, duration: 240, ambientTime: 30, moving: true, travelSpan: 45,
        layers: [{data: flat, time: 60, duration: 240, weight: 1}],
    };
    const scale = frame.height / 850;
    const worldX = 700;
    const ridge = SHRINE_RIDGES[2];
    const base = ridgeBaseAt(createRidgeProfile(frame, 2, scale), worldX, 45);
    for (const travel of [-0.13, 0.017, 0.19, 0.54]) {
        for (const weight of [0, 0.5, 1]) {
            const next = {...frame, travel, layers: [
                {data: flat, time: 60 + travel * 45, duration: 240, weight: 1 - weight},
                {data: loud, time: 8, duration: 180, weight},
            ]};
            const profile = createRidgeProfile(next, 2, scale);
            expect(ridgeBaseAt(profile, worldX - travel * SCENE_TRAVEL_DISTANCE * ridge.speed, 45)).toBeCloseTo(base, 8);
        }
    }
    const loudFrame = {...frame, layers: [{data: loud, time: 60, duration: 240, weight: 1}]};
    for (const depth of [0, 1]) {
        expect(ridgeBaseAt(createRidgeProfile(loudFrame, depth, scale), worldX))
            .toBeLessThan(ridgeBaseAt(createRidgeProfile(frame, depth, scale), worldX));
    }
});

it.each([[1440, 900], [390, 844], [844, 390]])('keeps house foundations grounded through travel and waveform blends at %s × %s', (width, height) => {
    const flat = createShrinePath('village', null);
    const peaks = createShrinePath('village', Uint8Array.from({length: 512}, (_, i) => i % 60 < 30 ? 255 : 0));
    const scale = Math.min(1.4, Math.max(0.55, height / 850));
    for (const travel of [-2, 0, 3.5]) {
        for (const weight of [0, 0.5, 1]) {
            const frame: SceneFrame<ShrinePath> = {
                width, height, travel, pointerX: 0, pointerY: 0, time: 60, duration: 240,
                ambientTime: 30, moving: true, travelSpan: 45,
                layers: [{data: flat, time: 60, duration: 240, weight: 1 - weight}, {data: peaks, time: 10, duration: 180, weight}],
            };
            const profile = createRidgeProfile(frame, 2, scale);
            const shifted = createRidgeProfile({...frame, pointerX: 1, pointerY: -1}, 2, scale);
            const halfWidth = 81 * 0.56 * scale;
            for (let x = 0; x <= width; x += 31) {
                const base = ridgeBaseAt(profile, x, halfWidth);
                for (let dx = -halfWidth; dx <= halfWidth; dx += 2) {
                    expect(base).toBeGreaterThanOrEqual(ridgeBaseAt(profile, x + dx));
                }
                expect(ridgeBaseAt(shifted, x + SHRINE_RIDGES[2].parallaxX, halfWidth))
                    .toBeCloseTo(base - SHRINE_RIDGES[2].parallaxY);
            }
        }
    }
});


it('scrolls terrain by the same pixel distance at phone and desktop widths', () => {
    const data = createShrinePath('village', null);
    const starts = [390, 844, 1440].map(width => {
        const frame: SceneFrame<ShrinePath> = {
            width, height: 850, travel: 0, pointerX: 0, pointerY: 0,
            time: 0, duration: 240, ambientTime: 0, moving: true, travelSpan: 45,
            layers: [{data, time: 0, duration: 240, weight: 1}],
        };
        const before = createRidgeProfile(frame, 2, 1);
        const after = createRidgeProfile({...frame, travel: 0.001}, 2, 1);
        return after.start - before.start;
    });
    expect(starts[0]).toBeCloseTo(-0.5184);
    expect(starts[1]).toBeCloseTo(starts[0]);
    expect(starts[2]).toBeCloseTo(starts[0]);
});
