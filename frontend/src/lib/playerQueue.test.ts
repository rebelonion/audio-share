import {describe, expect, it} from 'vitest';
import {
    EMPTY_QUEUE,
    advance,
    clearUpcoming,
    enqueue,
    makePlayerTrack,
    MAX_PERSISTED_CONTEXT_TRACKS,
    nextPlaybackStep,
    nextPlaybackStepForCurrent,
    queueForPersistence,
    removeQueued,
    restoreQueue,
    retreat,
    startContext,
    startSingleton,
} from './playerQueue';

function track(key: string) {
    return makePlayerTrack({src: `/audio/key/${key}`, shareKey: key, name: key, source: 'browse'});
}

describe('player queue', () => {
    it('starts at a selected context position and preserves previous navigation', () => {
        const tracks = [track('a'), track('b'), track('c')];
        const state = startContext(EMPTY_QUEUE, tracks, 1, 'Folder');
        expect(state.current?.shareKey).toBe('b');
        expect(state.context.map(item => item.shareKey)).toEqual(['c']);
        expect(retreat(state).current?.shareKey).toBe('a');
    });

    it('creates fresh occurrences whenever the same context is started again', () => {
        const tracks = [track('a'), track('b')];
        const first = startContext(EMPTY_QUEUE, tracks, 0, 'Folder');
        const second = startContext(first, tracks, 0, 'Folder');

        expect(second.current?.id).not.toBe(first.current?.id);
        expect(second.context[0].id).not.toBe(first.context[0].id);
    });

    it('prioritizes play-next and manual queue entries over context', () => {
        const base = startContext(EMPTY_QUEUE, [track('a'), track('b')], 0, 'Folder');
        const withQueued = enqueue(enqueue(base, track('later')), track('next'), true);
        const first = advance(withQueued);
        expect(first.current?.shareKey).toBe('next');
        expect(advance(first).current?.shareKey).toBe('later');
        expect(advance(advance(first)).current?.shareKey).toBe('b');
    });

    it('treats duplicate tracks as distinct queue occurrences', () => {
        const first = track('same');
        const duplicate = track('same');
        const state = enqueue(startSingleton(EMPTY_QUEUE, first), duplicate, true);
        const advanced = advance(state);

        expect(advanced.current?.src).toBe(first.src);
        expect(advanced.current?.id).toBe(duplicate.id);
        expect(advanced.current?.id).not.toBe(first.id);
    });

    it('advances explicit queue entries even when recommendations are disabled', () => {
        const context = startContext(EMPTY_QUEUE, [track('a'), track('b')], 0, 'Folder');
        const state = {...enqueue(context, track('manual')), autoplay: false};

        const first = nextPlaybackStep(state);
        expect(first.type).toBe('advance');
        if (first.type !== 'advance') throw new Error('expected queue advancement');
        expect(first.state.current?.shareKey).toBe('manual');

        const second = nextPlaybackStep(first.state);
        expect(second.type).toBe('advance');
        if (second.type !== 'advance') throw new Error('expected context advancement');
        expect(second.state.current?.shareKey).toBe('b');
    });

    it('uses autoplay only after the explicit queue is exhausted', () => {
        const currentOnly = startContext(EMPTY_QUEUE, [track('a')], 0, 'Folder');
        expect(nextPlaybackStep({...currentOnly, autoplay: false}).type).toBe('stop');
        expect(nextPlaybackStep({...currentOnly, autoplay: true}).type).toBe('recommend');
    });

    it('advances a manual item added while the current track is still active', () => {
        const ended = startContext(EMPTY_QUEUE, [track('a')], 0, 'Folder');
        const changedWhileLoading = enqueue(ended, track('manual'));
        const step = nextPlaybackStepForCurrent(changedWhileLoading, ended.current!.id);

        expect(step?.type).toBe('advance');
        if (step?.type !== 'advance') throw new Error('expected queue advancement');
        expect(step.state.current?.shareKey).toBe('manual');
    });

    it('ignores a pending playback decision after the current track changes', () => {
        const original = startContext(EMPTY_QUEUE, [track('a')], 0, 'Folder');
        const replacement = startSingleton(original, track('b'));

        expect(nextPlaybackStepForCurrent(replacement, original.current!.id)).toBeNull();
    });

    it('preserves explicit queue entries when a new track or context starts', () => {
        const original = startContext(EMPTY_QUEUE, [track('old'), track('old-context')], 0, 'Old');
        const queued = enqueue(original, track('manual'));

        const newContext = startContext(queued, [track('new'), track('new-context')], 0, 'New');
        expect(newContext.manual.map(item => item.shareKey)).toEqual(['manual']);
        expect(newContext.context.map(item => item.shareKey)).toEqual(['new-context']);

        const singleton = startSingleton(newContext, track('single'));
        expect(singleton.manual.map(item => item.shareKey)).toEqual(['manual']);
        expect(singleton.context).toHaveLength(0);
    });

    it('returns to the same track after previous when more manual tracks are queued', () => {
        const base = startContext(EMPTY_QUEUE, [track('a'), track('context')], 0, 'Folder');
        const queued = enqueue(enqueue(base, track('b')), track('c'));
        const playingB = advance(queued);
        const backToA = retreat(playingB);

        expect(backToA.current?.shareKey).toBe('a');
        expect(advance(backToA).current?.shareKey).toBe('b');
        expect(advance(advance(backToA)).current?.shareKey).toBe('c');
    });

    it('removes and clears upcoming entries without closing the current track', () => {
        const base = startContext(EMPTY_QUEUE, [track('a'), track('b')], 0, 'Folder');
        const queued = enqueue(base, track('manual'));
        const removed = removeQueued(queued, queued.manual[0].id);
        expect(removed.manual).toHaveLength(0);
        const cleared = clearUpcoming(removed);
        expect(cleared.current?.shareKey).toBe('a');
        expect(cleared.context).toHaveLength(0);
    });

    it('restores safe defaults from malformed persistence', () => {
        expect(restoreQueue('{bad json')).toEqual(EMPTY_QUEUE);
        expect(restoreQueue(JSON.stringify({autoplay: false})).autoplay).toBe(false);
        expect(restoreQueue(JSON.stringify({
            current: {src: '/audio/key/a'},
            manual: [null, {id: 'bad'}],
            context: 'not-an-array',
        }))).toMatchObject({
            current: null,
            manual: [],
            context: [],
        });
    });

    it('bounds persisted queues without changing live playback state', () => {
        const tracks = Array.from({length: MAX_PERSISTED_CONTEXT_TRACKS + 25}, (_, index) => track(String(index)));
        const context = startContext(EMPTY_QUEUE, tracks, 0, 'Large folder');
        const live = {...context, manual: tracks};
        const persisted = queueForPersistence(live);
        expect(persisted.manual).toHaveLength(MAX_PERSISTED_CONTEXT_TRACKS);
        expect(persisted.context).toHaveLength(MAX_PERSISTED_CONTEXT_TRACKS);
        expect(live.context).toHaveLength(MAX_PERSISTED_CONTEXT_TRACKS + 24);
        expect(live.manual).toHaveLength(MAX_PERSISTED_CONTEXT_TRACKS + 25);
    });
});
