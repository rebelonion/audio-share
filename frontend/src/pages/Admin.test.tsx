/** @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {HelmetProvider} from 'react-helmet-async';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import Admin from './Admin';
import {sendTargetedMessage} from '@/lib/adminManagement';
import {AdminAccessError, getLibraryHealth, getAdminSession, loginAdmin, logoutAdmin, type LibraryHealth} from '@/lib/operations';

vi.mock('@/lib/adminManagement', async original => ({...await original<typeof import('@/lib/adminManagement')>(), sendTargetedMessage: vi.fn()}));
vi.mock('@/lib/operations', async original => ({...await original<typeof import('@/lib/operations')>(), getLibraryHealth: vi.fn(), getAdminSession: vi.fn(), loginAdmin: vi.fn(), logoutAdmin: vi.fn()}));
const snapshot: LibraryHealth = {
    generatedAt: '2026-09-28T12:00:00Z', schemaVersion: 6,
    config: {buildId: 'test', indexSchedule: '', waveformSchedule: '', errorReportsEnabled: false},
    library: {tracks: 3, folders: 1, deleted: 1, unavailable: 0, removalRequested: 0, identityConflicts: 1, waveformReady: 1, waveformPending: 1, awaitingIndex: 1},
    jobs: [{id: 1, job: 'reindex', startedAt: '2026-09-28T11:00:00Z', finishedAt: null, state: 'interrupted', summary: {attempted: 0, processed: 0, issues: 0, folders: 0, deferredFolders: 0, details: {}}}],
    lastSuccess: {}, errors: [], conflicts: [{id: 1, shareKey: 'private', title: 'Private conflict', path: 'audio/conflict.wav', mediaId: 'duplicate'}], pendingWaveforms: [],
};
function mount() { render(<HelmetProvider><Admin /></HelmetProvider>); }
async function unlock() {
    await screen.findByLabelText('Admin API key');
    fireEvent.change(screen.getByLabelText('Admin API key'), {target: {value: 'private-test-key'}});
    fireEvent.click(screen.getByRole('button', {name: 'Unlock dashboard'}));
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.mocked(getLibraryHealth).mockReset().mockResolvedValue(snapshot); vi.mocked(getAdminSession).mockReset().mockResolvedValue(null); vi.mocked(loginAdmin).mockReset().mockResolvedValue({expiresAt: new Date(Date.now() + 3600000).toISOString()}); vi.mocked(logoutAdmin).mockReset().mockResolvedValue(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('keeps the key in memory and clears all data when locked', async () => {
    mount();
    expect(getLibraryHealth).not.toHaveBeenCalled();
    await unlock();
    await screen.findByText('Private conflict');
    expect(loginAdmin).toHaveBeenCalledWith('private-test-key');
    expect(getLibraryHealth).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button', {name: 'Lock dashboard'}));
    expect(screen.queryByText('Private conflict')).toBeNull();
    expect((await screen.findByLabelText('Admin API key') as HTMLInputElement).value).toBe('');
    expect(logoutAdmin).toHaveBeenCalledOnce();
});
it('ignores a late response after locking the dashboard', async () => {
    let resolve!: (value: LibraryHealth) => void;
    vi.mocked(getLibraryHealth).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    mount(); await unlock();
    await waitFor(() => expect(getLibraryHealth).toHaveBeenCalled());
    const signal = vi.mocked(getLibraryHealth).mock.calls[0][0];
    fireEvent.click(screen.getByRole('button', {name: 'Lock dashboard'}));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(snapshot));
    expect(screen.queryByText('Private conflict')).toBeNull();
});
it('clears stale data when an admin key is revoked', async () => {
    mount(); await unlock();
    await screen.findByText('Private conflict');
    vi.mocked(getLibraryHealth).mockRejectedValueOnce(new AdminAccessError('Key revoked'));
    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await screen.findByRole('alert');
    expect(screen.queryByText('Private conflict')).toBeNull();
    expect(screen.getByLabelText('Admin API key')).toBeTruthy();
});
it('retains an explicitly stale snapshot on a temporary refresh failure', async () => {
    mount(); await unlock();
    await screen.findByText('Private conflict');
    vi.mocked(getLibraryHealth).mockRejectedValueOnce(new Error('Server unavailable'));
    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await screen.findByText('Showing the last successful snapshot below.');
    expect(screen.getByText('Private conflict')).toBeTruthy();
});
it('filters runs and explains interrupted jobs and disabled reporting', async () => {
    mount(); await unlock();
    await screen.findByText('Private conflict');
    fireEvent.click(screen.getByText('Interrupted'));
    expect(screen.getByText(/Worker disconnected before recording completion/)).toBeTruthy();
    expect(screen.getByText(/Error reporting is disabled/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter maintenance runs'), {target: {value: 'waveform'}});
    await waitFor(() => expect(screen.getByText('No runs match these filters.')).toBeTruthy());
});

it('restores a cookie session on a fresh mount without requesting the key', async () => {
    vi.mocked(getAdminSession).mockResolvedValue({expiresAt: new Date(Date.now() + 3600000).toISOString()});
    mount();
    await screen.findByText('Private conflict');
    expect(loginAdmin).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Admin API key')).toBeNull();
});
it('clears private data at the fixed expiration without waiting for a request', async () => {
    vi.useFakeTimers();
    vi.mocked(getAdminSession).mockResolvedValue({expiresAt: new Date(Date.now() + 2000).toISOString()});
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Private conflict')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.queryByText('Private conflict')).toBeNull();
    expect(screen.getByLabelText('Admin API key')).toBeTruthy();
});
it('keeps private data cleared and offers retry when cookie logout fails', async () => {
    mount(); await unlock();
    await screen.findByText('Private conflict');
    vi.mocked(logoutAdmin).mockRejectedValueOnce(new Error('Network failure'));
    fireEvent.click(screen.getByRole('button', {name: 'Lock dashboard'}));
    await screen.findByRole('button', {name: 'Retry locking dashboard'});
    expect(screen.queryByText('Private conflict')).toBeNull();
    expect(screen.queryByLabelText('Admin API key')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Retry locking dashboard'}));
    await screen.findByLabelText('Admin API key');
    expect(logoutAdmin).toHaveBeenCalledTimes(2);
});
it('shows a rejected login and clears the submitted key', async () => {
    vi.mocked(loginAdmin).mockRejectedValue(new AdminAccessError('Invalid key'));
    mount(); await unlock();
    await screen.findByText('Invalid key');
    expect((screen.getByLabelText('Admin API key') as HTMLInputElement).value).toBe('');
    expect(getLibraryHealth).not.toHaveBeenCalled();
});

it('locks all admin sections when a management endpoint rejects the session', async () => {
    vi.mocked(sendTargetedMessage).mockRejectedValueOnce(new AdminAccessError('Session expired'));
    mount(); await unlock();
    await screen.findByText('Private conflict');
    fireEvent.click(screen.getByRole('button', {name: 'Messages'}));
    fireEvent.change(screen.getByLabelText('Session ID'), {target: {value: 'known-session'}});
    fireEvent.change(screen.getByLabelText('Message'), {target: {value: 'Private draft'}});
    fireEvent.click(screen.getByRole('button', {name: 'Send message'}));
    await screen.findByLabelText('Admin API key');
    expect(screen.queryByRole('navigation', {name: 'Admin sections'})).toBeNull();
    expect(screen.queryByText('Private conflict')).toBeNull();
    expect(screen.queryByLabelText('Message')).toBeNull();
});
