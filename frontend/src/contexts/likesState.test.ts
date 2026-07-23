import {describe, expect, it} from 'vitest';
import {
    INITIAL_LIKES_STATE,
    isTrackLiked,
    likesReducer,
} from './likesState';

describe('likes state', () => {
    it('loads profile data and preserves a newly created recovery key', () => {
        const created = likesReducer(INITIAL_LIKES_STATE, {type: 'recovery-key-created'});
        const loaded = likesReducer(created, {
            type: 'load-succeeded',
            shareKeys: ['one'],
            hasRecoveryKey: false,
        });

        expect(loaded.hasRecoveryKey).toBe(true);
        expect(loaded.isReady).toBe(true);
        expect(isTrackLiked(loaded, 'one')).toBe(true);
    });

    it('keeps pending optimistic changes when another refresh completes', () => {
        const loaded = likesReducer(INITIAL_LIKES_STATE, {
            type: 'load-succeeded',
            shareKeys: ['one'],
            hasRecoveryKey: false,
        });
        const toggling = likesReducer(loaded, {
            type: 'toggle-started',
            shareKey: 'two',
            liked: true,
        });
        const refreshed = likesReducer(toggling, {
            type: 'load-succeeded',
            shareKeys: ['one'],
            hasRecoveryKey: false,
        });

        expect(isTrackLiked(refreshed, 'two')).toBe(true);
        expect(refreshed.pendingLikes.has('two')).toBe(true);
    });

    it('advances the committed mutation revision after success', () => {
        const toggling = likesReducer(INITIAL_LIKES_STATE, {
            type: 'toggle-started',
            shareKey: 'two',
            liked: true,
        });
        const succeeded = likesReducer(toggling, {
            type: 'toggle-succeeded',
            shareKey: 'two',
        });

        expect(succeeded.pendingLikes.has('two')).toBe(false);
        expect(isTrackLiked(succeeded, 'two')).toBe(true);
        expect(succeeded.committedMutationRevision).toBe(1);
    });

    it('only advances the committed mutation revision after success', () => {
        const loaded = likesReducer(INITIAL_LIKES_STATE, {
            type: 'load-succeeded',
            shareKeys: ['one'],
            hasRecoveryKey: false,
        });
        const toggling = likesReducer(loaded, {
            type: 'toggle-started',
            shareKey: 'one',
            liked: false,
        });

        expect(isTrackLiked(toggling, 'one')).toBe(false);
        expect(toggling.committedMutationRevision).toBe(0);

        const failed = likesReducer(toggling, {
            type: 'toggle-failed',
            shareKey: 'one',
            error: 'Failed to update like',
        });
        expect(isTrackLiked(failed, 'one')).toBe(true);
        expect(failed.committedMutationRevision).toBe(0);
    });

    it('resets all state when the browser profile changes', () => {
        const loaded = likesReducer(INITIAL_LIKES_STATE, {
            type: 'load-succeeded',
            shareKeys: ['one'],
            hasRecoveryKey: true,
        });

        expect(likesReducer(loaded, {type: 'profile-reset'})).toEqual(INITIAL_LIKES_STATE);
    });
});
