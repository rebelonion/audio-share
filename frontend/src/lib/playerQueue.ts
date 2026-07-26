export type TrackSource = 'browse' | 'share' | 'home' | 'search' | 'likes' | 'manual' | 'autoplay';
export type QueuePlacement = 'next' | 'end';

export interface PlayerTrack {
    id: string;
    src: string;
    shareKey: string;
    name: string;
    artist?: string;
    deleted?: boolean;
    ageLimit?: number;
    source: TrackSource;
    queuePlacement?: QueuePlacement;
}

export interface QueueState {
    current: PlayerTrack | null;
    manual: PlayerTrack[];
    context: PlayerTrack[];
    history: PlayerTrack[];
    contextLabel: string | null;
    autoplay: boolean;
}

type NextPlaybackStep =
    | {type: 'advance'; state: QueueState}
    | {type: 'recommend'}
    | {type: 'stop'};

export const EMPTY_QUEUE: QueueState = {
    current: null,
    manual: [],
    context: [],
    history: [],
    contextLabel: null,
    autoplay: true,
};

export const MAX_PERSISTED_CONTEXT_TRACKS = 500;
const MAX_PERSISTED_HISTORY_TRACKS = 100;
const TRACK_SOURCES = new Set<string>(['browse', 'share', 'home', 'search', 'likes', 'manual', 'autoplay']);

export function queueForPersistence(state: QueueState): QueueState {
    return {
        ...state,
        manual: state.manual.slice(0, MAX_PERSISTED_CONTEXT_TRACKS),
        context: state.context.slice(0, MAX_PERSISTED_CONTEXT_TRACKS),
        history: state.history.slice(-MAX_PERSISTED_HISTORY_TRACKS),
    };
}

function queueTrackId(shareKey: string): string {
    const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${shareKey}:${suffix}`;
}

export function makePlayerTrack(
    track: Omit<PlayerTrack, 'id'> & {id?: string},
): PlayerTrack {
    return {...track, id: track.id || queueTrackId(track.shareKey)};
}

export function startContext(
    state: QueueState,
    tracks: PlayerTrack[],
    selectedIndex: number,
    contextLabel: string,
): QueueState {
    const safeIndex = Math.max(0, Math.min(selectedIndex, tracks.length - 1));
    if (tracks.length === 0) return state;
    const occurrences = tracks.map(track => ({
        ...track,
        id: queueTrackId(track.shareKey),
    }));
    return {
        ...state,
        current: occurrences[safeIndex],
        context: occurrences.slice(safeIndex + 1),
        history: occurrences.slice(0, safeIndex),
        contextLabel,
    };
}

export function startSingleton(state: QueueState, track: PlayerTrack): QueueState {
    return {
        ...state,
        current: track,
        context: [],
        history: state.current ? [...state.history, state.current].slice(-MAX_PERSISTED_HISTORY_TRACKS) : state.history,
        contextLabel: null,
    };
}

export function enqueue(state: QueueState, track: PlayerTrack, next = false): QueueState {
    const queuePlacement: QueuePlacement = next ? 'next' : 'end';
    const queuedTrack = {
        ...track,
        queuePlacement,
    };
    return {
        ...state,
        manual: next ? [queuedTrack, ...state.manual] : [...state.manual, queuedTrack],
    };
}

export function advance(state: QueueState): QueueState {
    const next = state.manual[0] || state.context[0];
    if (!next) return state;
    return {
        ...state,
        current: next,
        manual: state.manual[0] ? state.manual.slice(1) : state.manual,
        context: state.manual[0] ? state.context : state.context.slice(1),
        history: state.current ? [...state.history, state.current].slice(-MAX_PERSISTED_HISTORY_TRACKS) : state.history,
    };
}

export function retreat(state: QueueState): QueueState {
    const previous = state.history[state.history.length - 1];
    if (!previous) return state;
    return {
        ...state,
        current: previous,
        manual: state.current ? [state.current, ...state.manual] : state.manual,
        history: state.history.slice(0, -1),
    };
}

export function removeQueued(state: QueueState, id: string): QueueState {
    return {
        ...state,
        manual: state.manual.filter(track => track.id !== id),
        context: state.context.filter(track => track.id !== id),
    };
}

export function clearUpcoming(state: QueueState): QueueState {
    return {...state, manual: [], context: [], contextLabel: null};
}

function hasNext(state: QueueState): boolean {
    return state.manual.length > 0 || state.context.length > 0;
}

export function nextPlaybackStep(state: QueueState): NextPlaybackStep {
    if (hasNext(state)) {
        return {type: 'advance', state: advance(state)};
    }
    if (state.autoplay && state.current?.shareKey) {
        return {type: 'recommend'};
    }
    return {type: 'stop'};
}

export function nextPlaybackStepForCurrent(
    state: QueueState,
    expectedCurrentId: string,
): NextPlaybackStep | null {
    if (state.current?.id !== expectedCurrentId) return null;
    return nextPlaybackStep(state);
}

function isTrackSource(value: unknown): value is TrackSource {
    return typeof value === 'string' && TRACK_SOURCES.has(value);
}

function restoreTrack(value: unknown): PlayerTrack | null {
    if (
        !value
        || typeof value !== 'object'
        || !('id' in value)
        || typeof value.id !== 'string'
        || !('src' in value)
        || typeof value.src !== 'string'
        || !('shareKey' in value)
        || typeof value.shareKey !== 'string'
        || !('name' in value)
        || typeof value.name !== 'string'
        || !('source' in value)
        || !isTrackSource(value.source)
    ) {
        return null;
    }

    return {
        id: value.id,
        src: value.src,
        shareKey: value.shareKey,
        name: value.name,
        source: value.source,
        ...('artist' in value && typeof value.artist === 'string' ? {artist: value.artist} : {}),
        ...('deleted' in value && typeof value.deleted === 'boolean' ? {deleted: value.deleted} : {}),
        ...('ageLimit' in value && typeof value.ageLimit === 'number' ? {ageLimit: value.ageLimit} : {}),
        ...(
            'queuePlacement' in value
            && (value.queuePlacement === 'next' || value.queuePlacement === 'end')
                ? {queuePlacement: value.queuePlacement}
                : {}
        ),
    };
}

function restoreTracks(value: unknown): PlayerTrack[] {
    return Array.isArray(value)
        ? value.map(restoreTrack).filter((track): track is PlayerTrack => track !== null)
        : [];
}

export function restoreQueue(value: string | null): QueueState {
    if (!value) return EMPTY_QUEUE;
    try {
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') return EMPTY_QUEUE;
        return {
            current: 'current' in parsed ? restoreTrack(parsed.current) : null,
            manual: restoreTracks('manual' in parsed ? parsed.manual : null).slice(0, MAX_PERSISTED_CONTEXT_TRACKS),
            context: restoreTracks('context' in parsed ? parsed.context : null).slice(0, MAX_PERSISTED_CONTEXT_TRACKS),
            history: restoreTracks('history' in parsed ? parsed.history : null).slice(-MAX_PERSISTED_HISTORY_TRACKS),
            contextLabel: 'contextLabel' in parsed && typeof parsed.contextLabel === 'string' ? parsed.contextLabel : null,
            autoplay: !('autoplay' in parsed) || parsed.autoplay !== false,
        };
    } catch {
        return EMPTY_QUEUE;
    }
}
