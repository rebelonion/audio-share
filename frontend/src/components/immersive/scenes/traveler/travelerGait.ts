import {clamp} from '@/lib/utils';

interface Point {
    x: number;
    y: number;
}

const STANCE = 0.62;
const LEG_LENGTH = 10;

function ease(value: number): number {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
}

export function travelerFoot(distance: number, stride: number, offset: number, ground: (x: number) => number) {
    const phase = ((distance / stride + offset) % 1 + 1) % 1;
    const planted = phase < STANCE;
    const reach = stride * STANCE / 2;
    const heelStrike = 0.16 * Math.min(1, stride / 32);
    let x = reach - phase * stride;
    let lift = 0;
    let heelRoll = -heelStrike * (1 - ease(phase / 0.1))
        + 0.55 * ease((phase - 0.4) / (STANCE - 0.4));
    if (!planted) {
        const swing = (phase - STANCE) / (1 - STANCE);
        // Let the knee lead before the lower leg unfolds toward the landing.
        const followThrough = ease(swing) - 2.4 * swing ** 2 * (1 - swing) ** 2;
        // Match the ground's velocity at lift-off and landing, avoiding a foot snap.
        x = -reach + 2 * reach * followThrough - stride * (1 - STANCE) * swing * (1 - swing) * (1 - 2 * swing);
        lift = 3 * Math.sin(Math.PI * swing) ** 2 * (1 + 0.6 * swing);
        heelRoll = swing < 0.5
            ? 0.55 * (1 - ease(swing / 0.5))
            : -heelStrike * ease((swing - 0.5) / 0.5);
    }
    const slope = clamp((ground(x + 2) - ground(x - 2)) / 4, -0.8, 0.8);
    const groundAngle = Math.atan(slope);
    const angle = groundAngle + heelRoll;
    // Land on the heel, settle flat, then roll off the toe. Both pivots are
    // on the sole, so changing pivots while flat doesn't shift the ankle.
    const pivot = heelRoll < 0 ? -2 : 4;
    const contact = {
        x: x + pivot * Math.cos(groundAngle),
        y: ground(x) + pivot * Math.sin(groundAngle) - lift,
    };
    return {
        x: contact.x - pivot * Math.cos(angle) + 1.5 * Math.sin(angle),
        y: contact.y - pivot * Math.sin(angle) - 1.5 * Math.cos(angle),
        angle, contact, planted, phase,
    };
}

function kneeBetween(hip: Point, foot: Point): Point {
    const dx = foot.x - hip.x;
    const dy = foot.y - hip.y;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const bend = Math.sqrt(Math.max(0, LEG_LENGTH ** 2 - distance ** 2 / 4));
    return {x: (hip.x + foot.x) / 2 + dy / distance * bend, y: (hip.y + foot.y) / 2 - dx / distance * bend};
}

export function travelerPose(distance: number, stride: number, ground: (x: number) => number, walking: boolean) {
    const phase = ((distance / stride) % 1 + 1) % 1;
    const feet = walking
        ? [travelerFoot(distance, stride, 0.5, ground), travelerFoot(distance, stride, 0, ground)]
        : [-2, 2].map(x => ({x, y: ground(x) - 1.5, angle: Math.atan(clamp((ground(x + 2) - ground(x - 2)) / 4, -0.8, 0.8)), planted: true, phase: 0}));
    const legReach = LEG_LENGTH * 1.985;
    const stepReach = stride * STANCE / 2;
    // Keep the body's forward speed constant throughout the step. A fixed bias
    // leaves room for the reaching leg without a forward/backward torso surge.
    const hipX = walking ? stepReach * 0.15 : 0;
    const lowHeight = 1.45 + Math.sqrt(Math.max(0, legReach ** 2 - (stepReach - hipX) ** 2));
    const highHeight = 1.5 + Math.sqrt(Math.max(0, legReach ** 2 - hipX ** 2));
    const rise = (1 - Math.cos((phase - 0.06) * Math.PI * 4)) / 2;
    const hip = {
        x: hipX,
        y: walking ? ground(hipX) - lowHeight - (highHeight - lowHeight) * rise : ground(0) - legReach - 1.3,
    };
    // Uneven footholds may still require the pelvis to lower; on level ground
    // the planned body path leaves enough reach for both legs throughout the step.
    const reachableHeight = Math.max(...feet.map(foot => {
        const reach = Math.sqrt(Math.max(0, (LEG_LENGTH * 1.998) ** 2 - (foot.x - hip.x) ** 2));
        return foot.y - reach;
    }));
    hip.y = Math.max(hip.y, reachableHeight);
    const slope = (ground(6) - ground(-6)) / 12;
    return {
        hip,
        legs: feet.map(foot => ({foot, knee: kneeBetween(hip, foot)})),
        lean: walking ? clamp(0.015 - slope * 0.1, -0.06, 0.14) : 0.015,
        armSwing: walking ? Math.sin(phase * Math.PI * 2) : 0,
        lanternSwing: walking ? Math.sin(phase * Math.PI * 2 - 0.5) : 0,
    };
}
