import {afterEach, describe, expect, it, vi} from 'vitest';
import {
    MATURE_PREFERENCE_EVENT,
    resetMatureContentClientState,
} from './matureContentPreference';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('mature content client state', () => {
    it('clears warning acknowledgements and announces a disabled preference', () => {
        const values = new Map([
            ['mature-warning-ack', 'true'],
            ['mature-download-warning-ack', 'true'],
            ['unrelated', 'preserved'],
        ]);
        const removeItem = vi.fn((key: string) => values.delete(key));
        const dispatchEvent = vi.fn();
        vi.stubGlobal('sessionStorage', {removeItem});
        vi.stubGlobal('window', {dispatchEvent});

        resetMatureContentClientState();

        expect(removeItem).toHaveBeenCalledTimes(2);
        expect(values.has('mature-warning-ack')).toBe(false);
        expect(values.has('mature-download-warning-ack')).toBe(false);
        expect(values.get('unrelated')).toBe('preserved');
        expect(dispatchEvent).toHaveBeenCalledOnce();
        const event = dispatchEvent.mock.calls[0][0] as CustomEvent<boolean>;
        expect(event.type).toBe(MATURE_PREFERENCE_EVENT);
        expect(event.detail).toBe(false);
    });
});
