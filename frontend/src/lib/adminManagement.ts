import {API_BASE} from './api';
import type {SiteBanner} from './config';
import {AdminAccessError, checkAdminThrottle} from './operations';
import type {RequestStatus, RequestsByStatus, SourceRequest, Tag} from '@/types';

export interface AudioSource {
    shareKey: string;
    webpageUrl: string;
    title?: string;
    filename: string;
    unavailableAt: string | null;
    removalRequestedAt: string | null;
}
export interface NewRequest {
    title: string;
    submittedUrl: string;
    sourceKey: string;
    status: RequestStatus;
    tags: Tag[];
}
export interface TargetedMessageDraft {sessionId: string; title: string; message: string}
export interface PendingTargetedMessage extends TargetedMessageDraft {id: number; createdAt: string}

// A failed admin request that reached the server, kept with its status so
// callers can treat specific outcomes, such as an already-removed row, apart.
export class AdminRequestError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        method, signal, credentials: 'include', cache: 'no-store',
        ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
    });
    await checkAdminThrottle(response);
    if (response.status === 401) throw new AdminAccessError('Your admin session expired. Unlock the dashboard again.');
    if (!response.ok) {
        const result = await response.json().catch(() => null);
        const fallback = method === 'GET' ? 'Could not load data. Try refreshing.' : 'Could not confirm the change. Check the current state before retrying.';
        throw new AdminRequestError(response.status < 500 && typeof result?.error === 'string' ? result.error : fallback, response.status);
    }
    return response.json();
}

export const listAdminRequests = async (signal: AbortSignal): Promise<SourceRequest[]> => {
    const grouped = await request<RequestsByStatus>('/api/requests', signal);
    return Object.values(grouped).flat().map(item => ({...item, tags: item.tags ?? []})).sort((a, b) => b.id - a.id);
};
export const createAdminRequest = (body: NewRequest, signal: AbortSignal) => request<SourceRequest>('/api/admin/requests', signal, 'POST', body);
export const editAdminRequest = (id: number, body: {title: string; tags: Tag[]}, signal: AbortSignal) => request(`/api/admin/requests/${id}`, signal, 'PATCH', body);
export const changeRequestStatus = (id: number, body: {status: RequestStatus}, signal: AbortSignal) => request(`/api/admin/requests/${id}/status`, signal, 'PATCH', body);
export const deleteAdminRequest = (id: number, signal: AbortSignal) => request(`/api/admin/requests/${id}`, signal, 'DELETE');
export const listAudioSources = (signal: AbortSignal) => request<AudioSource[]>('/api/admin/audio/sources', signal);
export const setAudioUnavailable = (key: string, unavailable: boolean, signal: AbortSignal) => request(`/api/admin/audio/${encodeURIComponent(key)}/unavailable`, signal, 'PATCH', {unavailable});
export const setAudioRemovalRequested = (key: string, removalRequested: boolean, signal: AbortSignal) => request(`/api/admin/audio/${encodeURIComponent(key)}/removal-request`, signal, 'PATCH', {removalRequested});
export const sendTargetedMessage = (body: TargetedMessageDraft, signal: AbortSignal) => request<PendingTargetedMessage>('/api/admin/targeted-messages', signal, 'POST', body);
export const listTargetedMessages = (signal: AbortSignal) => request<PendingTargetedMessage[]>('/api/admin/targeted-messages', signal);
// Resolves false when the message was already gone because its visitor acknowledged it.
export const deleteTargetedMessage = (id: number, signal: AbortSignal) => request(`/api/admin/targeted-messages/${id}`, signal, 'DELETE').then(
    () => true,
    (cause: unknown) => { if (cause instanceof AdminRequestError && cause.status === 404) return false; throw cause; },
);

export type TrafficKind = 'stream' | 'download' | 'artwork' | 'api' | 'web';
export type TrafficRange = '1h' | '24h' | '7d' | '30d';
export interface TrafficCount {bytes: number; requests: number}
export interface TrafficWindow {window: TrafficRange | 'all'; total: TrafficCount; byKind: Partial<Record<TrafficKind, TrafficCount>>}
export interface TrafficReport {
    generatedAt: string;
    trackingSince: string | null;
    windows: TrafficWindow[];
    range: TrafficRange;
    rangeTotal: TrafficWindow;
    bucketSeconds: number;
    points: {at: string; bytes: number; byKind: Partial<Record<TrafficKind, number>>}[];
}
export interface TrafficLive {
    intervalSeconds: number;
    samples: {at: string; bytes: number; seconds: number}[];
    activeStreams: number;
    activeDownloads: number;
    discarded: TrafficCount;
    saving: {lastSavedAt: string | null; failingSince: string | null; lastError: string; unsaved: TrafficCount; pruneError: string};
}
export const getTraffic = (range: TrafficRange, signal: AbortSignal) => request<TrafficReport>(`/api/admin/traffic?range=${range}`, signal);
export const getTrafficLive = (signal: AbortSignal) => request<TrafficLive>('/api/admin/traffic/live', signal);

export const getSiteBanner = (signal: AbortSignal) => request<{banner: SiteBanner | null}>('/api/admin/banner', signal);
export const saveSiteBanner = (body: SiteBanner, signal: AbortSignal) => request<{banner: SiteBanner}>('/api/admin/banner', signal, 'PUT', body);
export const clearSiteBanner = (signal: AbortSignal) => request<{banner: null}>('/api/admin/banner', signal, 'DELETE');
