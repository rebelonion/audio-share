import {describe, expect, it} from 'vitest';
import {travelerFoot, travelerPose} from './travelerGait';

describe('traveler walking', () => {
    it.each([-0.6, 0, 0.6])('rests upright on slope %s while paused or scrubbing', slope => {
        const ground = (x: number) => x * slope;
        const resting = travelerPose(0, 24, ground, false);
        expect(ground(resting.hip.x) - resting.hip.y).toBeGreaterThan(19);
        for (const {foot, knee} of resting.legs) {
            expect(foot.planted).toBe(true);
            expect(Math.abs(foot.x - resting.hip.x)).toBeLessThan(4);
            expect(foot.y + 1.5).toBeCloseTo(ground(foot.x));
            expect(Math.hypot(knee.x - resting.hip.x, knee.y - resting.hip.y)).toBeCloseTo(10);
            expect(Math.hypot(foot.x - knee.x, foot.y - knee.y)).toBeCloseTo(10);
        }
        for (const distance of [6, 12, 18, 100]) {
            expect(travelerPose(distance, 24, ground, false)).toEqual(resting);
        }
    });

    it('keeps the toe planted in the world through the trailing heel roll', () => {
        const positions = [4, 8, 12, 14].map(distance => {
            const foot = travelerFoot(distance, 24, 0, x => (x + distance) * 0.2);
            expect(foot.planted).toBe(true);
            return {x: foot.contact.x + distance, y: foot.contact.y};
        });
        for (const position of positions) {
            expect(position.x).toBeCloseTo(positions[0].x);
            expect(position.y).toBeCloseTo(positions[0].y);
        }
    });

    it('lifts the returning foot above the terrain and keeps the other foot grounded', () => {
        const pose = travelerPose(24 * 0.81, 24, () => 0, true);
        const swinging = travelerFoot(24 * 0.81, 24, 0, () => 0);
        expect(swinging.planted).toBe(false);
        expect(swinging.contact.y).toBeLessThan(-2.5);
        expect(swinging.contact.y).toBeGreaterThan(-4.5);
        expect(pose.legs[0].foot.planted).toBe(true);
    });

    it('keeps the advancing leg bent until the final approach', () => {
        for (const stride of [20, 24, 32]) {
            for (const swing of [0.6, 0.7]) {
                const pose = travelerPose(stride * (0.62 + 0.38 * swing), stride, () => 0, true);
                const leg = pose.legs[1];
                expect(leg.foot.planted).toBe(false);
                expect(Math.hypot(leg.foot.x - pose.hip.x, leg.foot.y - pose.hip.y)).toBeLessThan(19);
            }
            const approach = travelerPose(stride * (0.62 + 0.38 * 0.8), stride, () => 0, true);
            const foot = approach.legs[1].foot;
            expect(Math.hypot(foot.x - approach.hip.x, foot.y - approach.hip.y)).toBeLessThan(19.6);
        }
    });

    it('lands heel first and settles the sole without sliding the heel', () => {
        const stride = 24;
        expect(travelerFoot(stride * 0.99, stride, 0, () => 0).angle).toBeLessThan(0);
        const landing = travelerFoot(0, stride, 0, () => 0);
        for (const phase of [0.02, 0.04, 0.08]) {
            const foot = travelerFoot(stride * phase, stride, 0, () => 0);
            expect(foot.angle).toBeLessThan(0);
            expect(foot.contact.x + stride * phase).toBeCloseTo(landing.contact.x);
            expect(foot.contact.y).toBe(0);
        }
        expect(travelerFoot(stride * 0.12, stride, 0, () => 0).angle).toBe(0);
    });

    it('settles slightly after contact, then rises without a second hip dip', () => {
        for (const stride of [20, 24, 32]) {
            for (const landing of [0, 0.5]) {
                const contact = travelerPose(stride * landing, stride, () => 0, true).hip.y;
                let previousHeight = travelerPose(stride * (landing + 0.06), stride, () => 0, true).hip.y;
                expect(previousHeight - contact).toBeGreaterThan(0);
                expect(previousHeight - contact).toBeLessThan(0.3);
                for (let step = 7; step <= 31; step++) {
                    const height = travelerPose(stride * (landing + step / 100), stride, () => 0, true).hip.y;
                    expect(height).toBeLessThanOrEqual(previousHeight + 0.000001);
                    previousHeight = height;
                }
            }
        }
    });

    it('keeps forward speed uniform and vertical movement smooth throughout each step', () => {
        for (const stride of [20, 24, 32]) {
            let previous = travelerPose(0, stride, () => 0, true).hip;
            for (let frame = 1; frame <= 1000; frame++) {
                const hip = travelerPose(stride * frame / 1000, stride, () => 0, true).hip;
                expect(Math.abs(hip.y - previous.y) * 1000).toBeLessThan(12);
                expect(stride / 1000 + hip.x - previous.x).toBeCloseTo(stride / 1000, 10);
                previous = hip;
            }
        }
    });

    it('stands over an almost straight supporting leg at mid-stride', () => {
        for (const stride of [20, 24, 32]) {
            for (const phase of [0.31, 0.81]) {
                const pose = travelerPose(stride * phase, stride, () => 0, true);
                const support = pose.legs.find(leg => leg.foot.planted)!;
                expect(Math.hypot(support.foot.x - pose.hip.x, support.foot.y - pose.hip.y)).toBeGreaterThan(19.7);
                expect(pose.hip.y).toBeLessThan(-21);
            }
        }
    });

    it.each([-0.6, 0, 0.6])('keeps thighs and shins the same length on a slope of %s', slope => {
        for (let distance = 0; distance < 32; distance += 0.5) {
            const pose = travelerPose(distance, 32, x => x * slope, true);
            for (const {foot, knee} of pose.legs) {
                expect(Math.hypot(knee.x - pose.hip.x, knee.y - pose.hip.y)).toBeCloseTo(10);
                expect(Math.hypot(foot.x - knee.x, foot.y - knee.y)).toBeCloseTo(10);
            }
        }
    });

    it.each([-0.6, 0, 0.6])('has no ankle snap through heel strike, foot roll, or lift-off on slope %s', slope => {
        const step = 0.00001;
        const ground = (x: number) => x * slope;
        for (const boundary of [24 * 0.1, 24 * 0.62, 24 * 0.81, 24]) {
            const before = travelerFoot(boundary - step, 24, 0, ground);
            const at = travelerFoot(boundary, 24, 0, ground);
            const after = travelerFoot(boundary + step, 24, 0, ground);
            expect(before.x).toBeCloseTo(after.x, 3);
            expect(before.y).toBeCloseTo(after.y, 3);
            expect((at.x - before.x) / step).toBeCloseTo((after.x - at.x) / step, 3);
            expect((at.y - before.y) / step).toBeCloseTo((after.y - at.y) / step, 3);
        }
    });
});
