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

export async function getLibraryHealth(key: string, signal: AbortSignal): Promise<LibraryHealth> {
    const response = await fetch(`${API_BASE}/api/admin/health`, {
        headers: {'X-API-Key': key}, cache: 'no-store', signal,
    });
    if (response.status === 401 || response.status === 403) throw new AdminAccessError('The admin key was not accepted. Check REQUESTS_API_KEY on the server.');
    if (!response.ok) throw new Error('Library health could not be refreshed. Check the server and try again.');
    return response.json();
}
