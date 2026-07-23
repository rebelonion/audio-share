import {describe, expect, it} from 'vitest';
import {
    needsMaturePlaybackConfirmation,
    shouldWaitForMaturePlaybackMetadata,
} from './maturePlayback';

describe('mature playback confirmation', () => {
    it('requires confirmation for mature queue metadata', () => {
        expect(needsMaturePlaybackConfirmation({ageLimit: 18}, null, false)).toBe(true);
    });

    it('requires confirmation when only fetched metadata marks the track mature', () => {
        expect(needsMaturePlaybackConfirmation({}, {isMature: true}, false)).toBe(true);
    });

    it('allows playback after either form of authorization', () => {
        expect(needsMaturePlaybackConfirmation({ageLimit: 18}, null, true)).toBe(false);
        expect(needsMaturePlaybackConfirmation({ageLimit: 18}, {showMature: true}, false)).toBe(false);
    });

    it('waits for fetched authorization before deciding a known mature track needs confirmation', () => {
        expect(shouldWaitForMaturePlaybackMetadata({ageLimit: 18}, null, false)).toBe(true);
        expect(shouldWaitForMaturePlaybackMetadata({ageLimit: 18}, {showMature: true}, false)).toBe(false);
    });

    it('stops waiting after a metadata failure so known mature tracks still require confirmation', () => {
        const fallbackMetadata = {};
        expect(shouldWaitForMaturePlaybackMetadata({ageLimit: 18}, fallbackMetadata, false)).toBe(false);
        expect(needsMaturePlaybackConfirmation({ageLimit: 18}, fallbackMetadata, false)).toBe(true);
    });
});
