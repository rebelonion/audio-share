/** @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {HelmetProvider} from 'react-helmet-async';
import {MemoryRouter, useNavigate} from 'react-router';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {searchAudio, type SearchResponse} from '@/lib/api';
import Search from './Search';

const mocks = vi.hoisted(() => ({track: vi.fn(), playTrack: vi.fn()}));
vi.mock('@/hooks/useRybbit', () => ({useRybbit: () => ({track: mocks.track})}));
vi.mock('@/hooks/useMatureContentPreference', () => ({useMatureContentPreference: () => ({enabled: false})}));
vi.mock('@/contexts/AudioPlayerContext', () => ({useAudioPlayerCommands: () => ({playTrack: mocks.playTrack})}));
vi.mock('@/components/RequestSourceDialog', () => ({default: () => null}));
vi.mock('@/components/TrackQuickActions', () => ({default: () => null}));
vi.mock('@/lib/api', () => ({searchAudio: vi.fn(), fetchDirectoryContents: vi.fn(async () => ({items: []})), isMatureAge: () => false}));
function response(name: string, total = 1): SearchResponse {
    return {results: [{id: 1, name, path: name, type: 'folder'}], total, count: 1, offset: 0, limit: 50, query: name};
}
function Navigation() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/search?q=second')}>Navigate</button>;
}
function mount(url = '/search?q=first') {
    render(<HelmetProvider><MemoryRouter initialEntries={[url]}><Navigation /><Search /></MemoryRouter></HelmetProvider>);
}
beforeEach(() => {
    vi.mocked(searchAudio).mockReset().mockResolvedValue(response('First result', 101));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('fetches once per page or filter change and preserves a directly linked page', async () => {
    mount('/search?q=first&page=2');
    await screen.findByText('First result');
    expect(searchAudio).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchAudio).mock.calls[0][2]).toBe(50);
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    await waitFor(() => expect(searchAudio).toHaveBeenCalledTimes(2));
    expect(vi.mocked(searchAudio).mock.calls[1][2]).toBe(100);
    fireEvent.click(screen.getByRole('button', {name: 'Audio'}));
    await waitFor(() => expect(searchAudio).toHaveBeenCalledTimes(3));
    expect(vi.mocked(searchAudio).mock.calls[2].slice(2, 4)).toEqual([0, {type: 'audio'}]);
});

it('ignores late results after navigation even if the transport ignores abort', async () => {
    let resolveFirst!: (value: SearchResponse) => void;
    vi.mocked(searchAudio).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    mount();
    const signal = vi.mocked(searchAudio).mock.calls[0][4];
    vi.mocked(searchAudio).mockResolvedValue(response('Second result'));
    fireEvent.click(screen.getByRole('button', {name: 'Navigate'}));
    await screen.findByText('Second result');
    expect(signal?.aborted).toBe(true);
    await act(async () => resolveFirst(response('Stale result')));
    expect(screen.queryByText('Stale result')).toBeNull();
    expect(screen.getByText('Second result')).toBeTruthy();
});

it('debounces typing, cancels stale requests, and clears results for a short query', async () => {
    mount();
    await screen.findByText('First result');
    vi.useFakeTimers();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: 'rain'}});
    fireEvent.change(input, {target: {value: 'rainfall'}});
    expect(searchAudio).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(searchAudio).toHaveBeenCalledTimes(2);
    expect(vi.mocked(searchAudio).mock.calls[1][0]).toBe('rainfall');
    fireEvent.change(input, {target: {value: 'r'}});
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(searchAudio).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('First result')).toBeNull();
});

it('offers a retry instead of reporting an error as no matches', async () => {
    vi.mocked(searchAudio).mockRejectedValueOnce(new Error('offline'));
    mount();
    await screen.findByRole('alert');
    expect(screen.queryByText('No results found')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Retry search'}));
    await screen.findByText('First result');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(searchAudio).toHaveBeenCalledTimes(2);
});

it('keeps pagination mounted and focused during a page request', async () => {
    mount();
    await screen.findByText('First result');
    let resolvePage!: (value: SearchResponse) => void;
    vi.mocked(searchAudio).mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
    const next = screen.getByRole('button', {name: 'Next'});
    next.focus();
    fireEvent.click(next);
    expect(document.activeElement).toBe(next);
    expect(screen.getByRole('button', {name: 'Next'})).toBe(next);
    expect((next as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolvePage(response('Next page', 101)));
    expect(document.activeElement).toBe(next);
    expect((next as HTMLButtonElement).disabled).toBe(false);
});
