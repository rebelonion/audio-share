/** @vitest-environment jsdom */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {markPreloadRecoveryAttempt} from './preloadRecovery';

afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '');
});

describe('markPreloadRecoveryAttempt', () => {
    it('allows only one recovery reload for the same build', () => {
        expect(markPreloadRecoveryAttempt('build-current')).toBe(true);
        expect(markPreloadRecoveryAttempt('build-current')).toBe(false);
    });

    it('allows recovery again after the build changes', () => {
        expect(markPreloadRecoveryAttempt('build-current')).toBe(true);
        expect(markPreloadRecoveryAttempt('build-next')).toBe(true);
    });

    it('does not allow a reload when the guard cannot be persisted', () => {
        vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
            throw new DOMException('History is unavailable');
        });

        expect(markPreloadRecoveryAttempt('build-current')).toBe(false);
    });
});
