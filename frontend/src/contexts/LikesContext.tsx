import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    type ReactNode,
} from 'react';
import {getLikes, setTrackLiked} from '@/lib/api';
import {syncRybbitIdentity} from '@/lib/rybbitIdentity';
import {
    INITIAL_LIKES_STATE,
    isTrackLiked,
    likesReducer,
} from '@/contexts/likesState';

interface LikesContextValue {
    hasRecoveryKey: boolean;
    isReady: boolean;
    isLoading: boolean;
    error: string | null;
    committedMutationRevision: number;
    isLiked: (shareKey?: string) => boolean;
    isLikePending: (shareKey?: string) => boolean;
    toggleLike: (shareKey: string) => Promise<boolean>;
    refreshLikes: () => Promise<void>;
    refreshLikesAfterRecovery: () => Promise<void>;
    markRecoveryKeyCreated: () => void;
}

const LikesContext = createContext<LikesContextValue | null>(null);

export function LikesProvider({children}: {children: ReactNode}) {
    const [state, dispatch] = useReducer(likesReducer, INITIAL_LIKES_STATE);
    const stateRef = useRef(state);
    const loadControllerRef = useRef<AbortController | null>(null);
    const mutationControllersRef = useRef(new Map<string, AbortController>());
    stateRef.current = state;

    const loadLikes = useCallback(async (showLoading: boolean) => {
        loadControllerRef.current?.abort();
        const controller = new AbortController();
        loadControllerRef.current = controller;
        dispatch({type: 'load-started', showLoading});
        try {
            const response = await getLikes(controller.signal);
            if (controller.signal.aborted) return;
            syncRybbitIdentity(response.profileId);
            dispatch({
                type: 'load-succeeded',
                shareKeys: response.shareKeys,
                hasRecoveryKey: response.hasRecoveryKey,
            });
        } catch (loadError) {
            if (controller.signal.aborted) return;
            dispatch({
                type: 'load-failed',
                error: loadError instanceof Error ? loadError.message : 'Failed to load likes',
            });
        } finally {
            if (loadControllerRef.current === controller) loadControllerRef.current = null;
        }
    }, []);

    const refreshLikes = useCallback(() => loadLikes(true), [loadLikes]);
    const refreshLikesAfterRecovery = useCallback(() => {
        loadControllerRef.current?.abort();
        for (const controller of mutationControllersRef.current.values()) controller.abort();
        mutationControllersRef.current.clear();
        dispatch({type: 'profile-reset'});
        return loadLikes(true);
    }, [loadLikes]);

    useEffect(() => {
        void refreshLikes();
        const mutationControllers = mutationControllersRef.current;
        return () => {
            loadControllerRef.current?.abort();
            for (const controller of mutationControllers.values()) controller.abort();
            mutationControllers.clear();
        };
    }, [refreshLikes]);

    const toggleLike = useCallback(async (shareKey: string) => {
        const current = stateRef.current;
        if (!current.isReady || mutationControllersRef.current.has(shareKey)) return false;

        const liked = !isTrackLiked(current, shareKey);
        const controller = new AbortController();
        mutationControllersRef.current.set(shareKey, controller);
        dispatch({type: 'toggle-started', shareKey, liked});
        try {
            await setTrackLiked(shareKey, liked, controller.signal);
            if (controller.signal.aborted) return false;
            dispatch({type: 'toggle-succeeded', shareKey});
            return true;
        } catch (updateError) {
            if (controller.signal.aborted) return false;
            dispatch({
                type: 'toggle-failed',
                shareKey,
                error: updateError instanceof Error ? updateError.message : 'Failed to update like',
            });
            return false;
        } finally {
            if (mutationControllersRef.current.get(shareKey) === controller) {
                mutationControllersRef.current.delete(shareKey);
            }
        }
    }, []);

    const value = useMemo<LikesContextValue>(() => ({
        hasRecoveryKey: state.hasRecoveryKey,
        isReady: state.isReady,
        isLoading: state.isLoading,
        error: state.error,
        committedMutationRevision: state.committedMutationRevision,
        isLiked: shareKey => isTrackLiked(state, shareKey),
        isLikePending: shareKey => !!shareKey && state.pendingLikes.has(shareKey),
        toggleLike,
        refreshLikes,
        refreshLikesAfterRecovery,
        markRecoveryKeyCreated: () => dispatch({type: 'recovery-key-created'}),
    }), [refreshLikes, refreshLikesAfterRecovery, state, toggleLike]);

    return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>;
}

export function useLikes() {
    const value = useContext(LikesContext);
    if (!value) throw new Error('useLikes must be used within LikesProvider');
    return value;
}
