/** @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {HelmetProvider} from 'react-helmet-async';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import Admin from './Admin';
import {AdminAccessError, getLibraryHealth, type LibraryHealth} from '@/lib/operations';

vi.mock('@/lib/operations', async original => ({...await original<typeof import('@/lib/operations')>(), getLibraryHealth: vi.fn()}));
const snapshot: LibraryHealth = {
    generatedAt: '2026-09-28T12:00:00Z', schemaVersion: 6,
    config: {buildId: 'test', indexSchedule: '', waveformSchedule: '', errorReportsEnabled: false},
    library: {tracks: 3, folders: 1, deleted: 1, unavailable: 0, removalRequested: 0, identityConflicts: 1, waveformReady: 1, waveformPending: 1, awaitingIndex: 1},
    jobs: [{id: 1, job: 'reindex', startedAt: '2026-09-28T11:00:00Z', finishedAt: null, state: 'interrupted', summary: {attempted: 0, processed: 0, issues: 0, folders: 0, deferredFolders: 0, details: {}}}],
    lastSuccess: {}, errors: [], conflicts: [{id: 1, shareKey: 'private', title: 'Private conflict', path: 'audio/conflict.wav', mediaId: 'duplicate'}], pendingWaveforms: [],
};
function mount() { render(<HelmetProvider><Admin /></HelmetProvider>); }
function unlock() {
    fireEvent.change(screen.getByLabelText('Admin API key'), {target: {value: 'private-test-key'}});
    fireEvent.click(screen.getByRole('button', {name: 'Unlock dashboard'}));
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.mocked(getLibraryHealth).mockReset().mockResolvedValue(snapshot); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('keeps the key in memory and clears all data when locked', async () => {
    mount();
    expect(getLibraryHealth).not.toHaveBeenCalled();
    unlock();
    await screen.findByText('Private conflict');
    expect(getLibraryHealth).toHaveBeenCalledWith('private-test-key', expect.any(AbortSignal));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button', {name: 'Lock dashboard'}));
    expect(screen.queryByText('Private conflict')).toBeNull();
    expect((screen.getByLabelText('Admin API key') as HTMLInputElement).value).toBe('');
});
it('ignores a late response after locking the dashboard', async () => {
    let resolve!: (value: LibraryHealth) => void;
    vi.mocked(getLibraryHealth).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    mount(); unlock();
    const signal = vi.mocked(getLibraryHealth).mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', {name: 'Lock dashboard'}));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(snapshot));
    expect(screen.queryByText('Private conflict')).toBeNull();
});
it('clears stale data when an admin key is revoked', async () => {
    mount(); unlock();
    await screen.findByText('Private conflict');
    vi.mocked(getLibraryHealth).mockRejectedValueOnce(new AdminAccessError('Key revoked'));
    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await screen.findByRole('alert');
    expect(screen.queryByText('Private conflict')).toBeNull();
    expect(screen.getByLabelText('Admin API key')).toBeTruthy();
});
it('retains an explicitly stale snapshot on a temporary refresh failure', async () => {
    mount(); unlock();
    await screen.findByText('Private conflict');
    vi.mocked(getLibraryHealth).mockRejectedValueOnce(new Error('Server unavailable'));
    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await screen.findByText('Showing the last successful snapshot below.');
    expect(screen.getByText('Private conflict')).toBeTruthy();
});
it('filters runs and explains interrupted jobs and disabled reporting', async () => {
    mount(); unlock();
    await screen.findByText('Private conflict');
    fireEvent.click(screen.getByText('Interrupted'));
    expect(screen.getByText(/Worker disconnected before recording completion/)).toBeTruthy();
    expect(screen.getByText(/Error reporting is disabled/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter maintenance runs'), {target: {value: 'waveform'}});
    await waitFor(() => expect(screen.getByText('No runs match these filters.')).toBeTruthy());
});
