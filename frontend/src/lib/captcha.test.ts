/** @vitest-environment jsdom */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

interface SolveResult {
    success: boolean;
    token?: string;
}

interface DeferredSolve {
    promise: Promise<SolveResult | undefined>;
    resolve: (result: SolveResult | undefined) => void;
}

interface CapInstance {
    widget: {
        remove: ReturnType<typeof vi.fn>;
    };
    addEventListener: ReturnType<typeof vi.fn>;
    dispatchError: (event: CustomEvent) => void;
    reset: ReturnType<typeof vi.fn>;
    solve: ReturnType<typeof vi.fn>;
}

const capState = vi.hoisted(() => ({
    solves: [] as DeferredSolve[],
    instances: [] as CapInstance[],
}));

vi.mock('@/lib/config', () => ({
    CAP_PUBLIC_ENDPOINT: 'https://cap.example/',
}));

vi.mock('@cap.js/widget', () => ({
    default: class {
        private activeSolve: DeferredSolve | undefined;
        private errorListeners: Array<(event: CustomEvent) => void> = [];

        widget = {
            remove: vi.fn(() => this.activeSolve?.resolve(undefined)),
        };

        addEventListener = vi.fn((name: string, listener: (event: CustomEvent) => void) => {
            if (name === 'error') this.errorListeners.push(listener);
        });

        dispatchError = (event: CustomEvent) => {
            for (const listener of this.errorListeners) listener(event);
        };

        reset = vi.fn();

        solve = vi.fn(() => {
            const next = capState.solves.shift();
            if (!next) throw new Error('Missing mocked solve');
            this.activeSolve = next;
            return next.promise;
        });

        constructor() {
            capState.instances.push(this);
        }
    },
}));

function deferredSolve(): DeferredSolve {
    let resolve!: DeferredSolve['resolve'];
    const promise = new Promise<SolveResult | undefined>(next => {
        resolve = next;
    });
    return {promise, resolve};
}

beforeEach(() => {
    capState.solves.length = 0;
    capState.instances.length = 0;
    window.rybbit = undefined;
});

afterEach(() => {
    window.rybbit = undefined;
    vi.clearAllMocks();
    vi.resetModules();
});

describe('solveCaptcha', () => {
    it('disposes an aborted active solve and advances the queue with a fresh widget', async () => {
        const abandoned = deferredSolve();
        const replacement = deferredSolve();
        replacement.resolve({success: true, token: 'replacement-token'});
        capState.solves.push(abandoned, replacement);
        const {solveCaptcha} = await import('./captcha');
        const controller = new AbortController();

        const first = solveCaptcha(controller.signal);
        await vi.waitFor(() => expect(capState.instances[0]?.solve).toHaveBeenCalledOnce());
        const second = solveCaptcha();
        const firstResult = expect(first).rejects.toMatchObject({name: 'AbortError'});

        controller.abort();

        await firstResult;
        await expect(second).resolves.toBe('replacement-token');
        expect(capState.instances).toHaveLength(2);
        expect(capState.instances[0].widget.remove).toHaveBeenCalledOnce();
        expect(capState.instances[1].widget.remove).not.toHaveBeenCalled();
    });

    it('does not dispose the active widget when only a queued solve is aborted', async () => {
        const active = deferredSolve();
        capState.solves.push(active);
        const {solveCaptcha} = await import('./captcha');
        const queuedController = new AbortController();

        const first = solveCaptcha();
        await vi.waitFor(() => expect(capState.instances[0]?.solve).toHaveBeenCalledOnce());
        const queued = solveCaptcha(queuedController.signal);
        const queuedResult = expect(queued).rejects.toMatchObject({name: 'AbortError'});

        queuedController.abort();
        expect(capState.instances[0].widget.remove).not.toHaveBeenCalled();
        active.resolve({success: true, token: 'active-token'});

        await expect(first).resolves.toBe('active-token');
        await queuedResult;
        expect(capState.instances).toHaveLength(1);
        expect(capState.instances[0].widget.remove).not.toHaveBeenCalled();
    });

    it('stops Cap errors from bubbling and records their details as a custom event', async () => {
        const active = deferredSolve();
        capState.solves.push(active);
        const eventMock = vi.fn();
        window.rybbit = {event: eventMock} as unknown as NonNullable<Window['rybbit']>;
        const {solveCaptcha} = await import('./captcha');

        const solve = solveCaptcha();
        await vi.waitFor(() => expect(capState.instances[0]?.solve).toHaveBeenCalledOnce());
        const errorEvent = new CustomEvent('error', {
            detail: {
                isCap: true,
                code: 'network_error',
                message: 'Blocked',
            },
        });
        const stopPropagation = vi.spyOn(errorEvent, 'stopPropagation');

        capState.instances[0].dispatchError(errorEvent);
        active.resolve({success: true, token: 'active-token'});

        await expect(solve).resolves.toBe('active-token');
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(eventMock).toHaveBeenCalledWith('captcha-error', {
            code: 'network_error',
            message: 'Blocked',
        });
    });

    it('uses the captured Cap error when solve returns without a result', async () => {
        const active = deferredSolve();
        capState.solves.push(active);
        const {solveCaptcha} = await import('./captcha');

        const solve = solveCaptcha();
        await vi.waitFor(() => expect(capState.instances[0]?.solve).toHaveBeenCalledOnce());
        capState.instances[0].dispatchError(new CustomEvent('error', {
            detail: {
                isCap: true,
                code: 'instr_timeout',
                message: 'Instrumentation timed out',
            },
        }));
        active.resolve(undefined);

        await expect(solve).rejects.toMatchObject({
            name: 'CaptchaSolveError',
            code: 'instr_timeout',
            message: 'Instrumentation timed out',
        });
    });
});
