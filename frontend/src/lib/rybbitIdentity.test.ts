import {afterEach, describe, expect, it, vi} from 'vitest';
import {setRybbitAdBlockTraits, syncRybbitIdentity} from './rybbitIdentity';

function installRybbit(currentUserId: string | null = null) {
    let userId = currentUserId;
    const identify = vi.fn((nextUserId: string) => {
        userId = nextUserId;
    });
    const setTraits = vi.fn();
    vi.stubGlobal('window', {
        rybbit: {
            getUserId: () => userId,
            identify,
            setTraits,
        },
    });
    return {identify, setTraits};
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

    it('includes a detected ad-block status when identification happens later', () => {
        const rybbit = installRybbit();

        setRybbitAdBlockTraits('blocked', 'blocked');
        syncRybbitIdentity('new-profile');

        expect(rybbit.setTraits).not.toHaveBeenCalled();
        expect(rybbit.identify).toHaveBeenCalledWith('new-profile', {
            ad_block_status: 'blocked',
            ad_delivery_status: 'blocked',
        });
    });

    it('updates traits when ad-block detection happens after identification', () => {
        const rybbit = installRybbit('current-profile');

        setRybbitAdBlockTraits('not_detected', 'available');

        expect(rybbit.setTraits).toHaveBeenCalledWith({
            ad_block_status: 'not_detected',
            ad_delivery_status: 'available',
        });
    });
});
