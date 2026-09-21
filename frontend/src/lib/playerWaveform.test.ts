import {beforeEach, expect, it, vi} from 'vitest';
import {appFetch} from './cloudflareChallenge';

vi.mock('./cloudflareChallenge', () => ({appFetch: vi.fn()}));
vi.mock('./api', () => ({API_BASE: ''}));

beforeEach(() => {
    vi.resetModules();
    vi.mocked(appFetch).mockReset();
});

it('reuses an in-flight preload when playback requests the next waveform', async () => {
    const {loadPlayerWaveform} = await import('./playerWaveform');
    let finish!: (response: Response) => void;
    vi.mocked(appFetch).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const preload = loadPlayerWaveform('next');
    expect(loadPlayerWaveform('next')).toBe(preload);
    finish(new Response(JSON.stringify({peaks: 'AA==', duration: 60})));
    await expect(preload).resolves.toEqual({peaks: 'AA==', duration: 60});
    expect(loadPlayerWaveform('next')).toBe(preload);
    expect(appFetch).toHaveBeenCalledOnce();
});

it('allows a failed preload to be retried when playback needs it', async () => {
    const {loadPlayerWaveform} = await import('./playerWaveform');
    vi.mocked(appFetch).mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(new Response(JSON.stringify({peaks: 'AA=='})));
    await expect(loadPlayerWaveform('next')).resolves.toBeNull();
    await expect(loadPlayerWaveform('next')).resolves.toEqual({peaks: 'AA=='});
    expect(appFetch).toHaveBeenCalledTimes(2);
});

it('bounds the cache as the queue advances', async () => {
    const {loadPlayerWaveform} = await import('./playerWaveform');
    vi.mocked(appFetch).mockImplementation(async () => new Response(JSON.stringify({peaks: 'AA=='})));
    for (const key of ['one', 'two', 'three', 'four', 'one']) await loadPlayerWaveform(key);
    expect(appFetch).toHaveBeenCalledTimes(5);
});
