export interface LikesState {
    likedKeys: Set<string>;
    hasRecoveryKey: boolean;
    isReady: boolean;
    isLoading: boolean;
    error: string | null;
    pendingLikes: Map<string, boolean>;
    committedMutationRevision: number;
}

export type LikesAction =
    | {type: 'load-started'; showLoading: boolean}
    | {type: 'load-succeeded'; shareKeys: string[]; hasRecoveryKey: boolean}
    | {type: 'load-failed'; error: string}
    | {type: 'profile-reset'}
    | {type: 'recovery-key-created'}
    | {type: 'toggle-started'; shareKey: string; liked: boolean}
    | {type: 'toggle-succeeded'; shareKey: string}
    | {type: 'toggle-failed'; shareKey: string; error: string};

export const INITIAL_LIKES_STATE: LikesState = {
    likedKeys: new Set(),
    hasRecoveryKey: false,
    isReady: false,
    isLoading: true,
    error: null,
    pendingLikes: new Map(),
    committedMutationRevision: 0,
};

function withMembership(keys: Set<string>, shareKey: string, liked: boolean): Set<string> {
    const next = new Set(keys);
    if (liked) {
        next.add(shareKey);
    } else {
        next.delete(shareKey);
    }
    return next;
}

export function likesReducer(state: LikesState, action: LikesAction): LikesState {
    switch (action.type) {
        case 'load-started':
            return {
                ...state,
                isLoading: action.showLoading,
            };
        case 'load-succeeded': {
            let likedKeys = new Set(action.shareKeys);
            for (const [shareKey, liked] of state.pendingLikes) {
                likedKeys = withMembership(likedKeys, shareKey, liked);
            }
            return {
                ...state,
                likedKeys,
                hasRecoveryKey: state.hasRecoveryKey || action.hasRecoveryKey,
                isReady: true,
                isLoading: false,
                error: null,
            };
        }
        case 'load-failed':
            return {
                ...state,
                isLoading: false,
                error: action.error,
            };
        case 'profile-reset':
            return INITIAL_LIKES_STATE;
        case 'recovery-key-created':
            return {
                ...state,
                hasRecoveryKey: true,
            };
        case 'toggle-started':
            return {
                ...state,
                error: null,
                likedKeys: withMembership(state.likedKeys, action.shareKey, action.liked),
                pendingLikes: new Map(state.pendingLikes).set(action.shareKey, action.liked),
            };
        case 'toggle-succeeded': {
            const pendingLikes = new Map(state.pendingLikes);
            pendingLikes.delete(action.shareKey);
            return {
                ...state,
                pendingLikes,
                committedMutationRevision: state.committedMutationRevision + 1,
            };
        }
        case 'toggle-failed': {
            const attemptedLike = state.pendingLikes.get(action.shareKey);
            const pendingLikes = new Map(state.pendingLikes);
            pendingLikes.delete(action.shareKey);
            return {
                ...state,
                likedKeys: attemptedLike === undefined
                    ? state.likedKeys
                    : withMembership(state.likedKeys, action.shareKey, !attemptedLike),
                pendingLikes,
                error: action.error,
            };
        }
    }
}

export function isTrackLiked(state: LikesState, shareKey?: string): boolean {
    return !!shareKey && state.likedKeys.has(shareKey);
}
