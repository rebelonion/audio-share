import {API_BASE} from './api';

export interface JobDetails {
    message?: string;
    resource?: string;
    step?: string;
    failureCounts?: Record<string, number>;
    failures?: JobDetails[];
}
export interface JobRun {
    id: number;
    job: 'reindex' | 'waveform';
    startedAt: string;
    finishedAt: string | null;
    state: 'running' | 'succeeded' | 'degraded' | 'failed' | 'interrupted';
    summary: {attempted: number; processed: number; issues: number; folders: number; deferredFolders: number; details: JobDetails};
}
export interface HealthTrack {id: number; shareKey: string; path: string; title: string; mediaId: string}
export interface LibraryHealth {
    generatedAt: string;
    schemaVersion: number;
    config: {buildId: string; indexSchedule: string; waveformSchedule: string; errorReportsEnabled: boolean};
    library: {tracks: number; folders: number; deleted: number; unavailable: number; removalRequested: number; identityConflicts: number; waveformReady: number; waveformPending: number; awaitingIndex: number};
    jobs: JobRun[];
    lastSuccess: Partial<Record<'reindex' | 'waveform', string>>;
    pendingWaveforms: HealthTrack[];
    conflicts: HealthTrack[];
    errors: {id: number; createdAt: string; origin: string; operation: string; stage: string; cause: string; outcome: string; failedItems: number; context: JobDetails}[];
}

export class AdminAccessError extends Error {}

export async function checkAdminThrottle(response: Response): Promise<void> {
    if (response.status !== 429) return;
    const body = await response.json().catch(() => null);
    if (body?.code === 'admin_auth_rate_limited') {
        throw new AdminAccessError(typeof body.error === 'string' ? body.error : 'Too many failed admin authentication attempts. Try again later.');
    }
    throw new Error('Too many requests. Try again later.');
}

export interface AdminSession {expiresAt: string}

export async function getAdminSession(signal: AbortSignal): Promise<AdminSession | null> {
    const response = await fetch(`${API_BASE}/api/admin/session`, {credentials: 'include', cache: 'no-store', signal});
    await checkAdminThrottle(response);
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('Could not check your admin session. Try unlocking again.');
    return response.json();
}

export async function loginAdmin(key: string): Promise<AdminSession> {
    const response = await fetch(`${API_BASE}/api/admin/session`, {
        method: 'POST', credentials: 'include', headers: {'X-API-Key': key}, cache: 'no-store',
    });
    await checkAdminThrottle(response);
    if (response.status === 401) throw new AdminAccessError('The admin key was not accepted. Check REQUESTS_API_KEY on the server.');
    if (!response.ok) throw new Error('Could not start an admin session. Check the server and allowed origin.');
    return response.json();
}

export async function logoutAdmin(): Promise<void> {
    const response = await fetch(`${API_BASE}/api/admin/session`, {method: 'DELETE', credentials: 'include', cache: 'no-store'});
    if (!response.ok) throw new Error('Could not clear the admin cookie. Retry locking the dashboard.');
}

export async function getLibraryHealth(signal: AbortSignal): Promise<LibraryHealth> {
    const response = await fetch(`${API_BASE}/api/admin/health`, {credentials: 'include', cache: 'no-store', signal});
    await checkAdminThrottle(response);
    if (response.status === 401) throw new AdminAccessError('Your admin session expired or was invalidated. Unlock the dashboard again.');
    if (!response.ok) throw new Error('Library health could not be refreshed. Check the server and try again.');
    return response.json();
}
