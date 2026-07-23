import {afterEach, describe, expect, it, vi} from 'vitest';
import {syncRybbitIdentity} from './rybbitIdentity';

function installRybbit(currentUserId: string | null = null) {
    let userId = currentUserId;
    const identify = vi.fn((nextUserId: string) => {
        userId = nextUserId;
    });
    vi.stubGlobal('window', {
        rybbit: {
            getUserId: () => userId,
            identify,
        },
    });
    return {identify};
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Rybbit profile synchronization', () => {
    it('identifies a different anonymous profile', () => {
        const rybbit = installRybbit('old-profile');
        syncRybbitIdentity('new-profile');
        expect(rybbit.identify).toHaveBeenCalledOnce();
        expect(rybbit.identify).toHaveBeenCalledWith('new-profile');
    });

    it('does not identify the same profile twice', () => {
        const rybbit = installRybbit('same-profile');
        syncRybbitIdentity('same-profile');
        expect(rybbit.identify).not.toHaveBeenCalled();
    });
});
