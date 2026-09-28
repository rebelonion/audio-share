import {API_BASE} from './api';
import {AdminAccessError} from './operations';
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

async function request<T>(path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        method, signal, credentials: 'include', cache: 'no-store',
        ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
    });
    if (response.status === 401) throw new AdminAccessError('Your admin session expired. Unlock the dashboard again.');
    if (!response.ok) {
        const result = await response.json().catch(() => null);
        const fallback = method === 'GET' ? 'Could not load data. Try refreshing.' : 'Could not confirm the change. Check the current state before retrying.';
        throw new Error(response.status < 500 && typeof result?.error === 'string' ? result.error : fallback);
    }
    return response.json();
}

export const listAdminRequests = async (signal: AbortSignal): Promise<SourceRequest[]> => {
    const grouped = await request<RequestsByStatus>('/api/requests', signal);
    return Object.values(grouped).flat().map(item => ({...item, tags: item.tags ?? []})).sort((a, b) => b.id - a.id);
};
export const createAdminRequest = (body: NewRequest, signal: AbortSignal) => request<SourceRequest>('/api/admin/requests', signal, 'POST', body);
export const editAdminRequest = (id: number, body: {title: string; tags: Tag[]}, signal: AbortSignal) => request(`/api/admin/requests/${id}`, signal, 'PATCH', body);
export const changeRequestStatus = (id: number, body: {status: RequestStatus; folderShareKey: string | null}, signal: AbortSignal) => request(`/api/admin/requests/${id}/status`, signal, 'PATCH', body);
export const deleteAdminRequest = (id: number, signal: AbortSignal) => request(`/api/admin/requests/${id}`, signal, 'DELETE');
export const listAudioSources = (signal: AbortSignal) => request<AudioSource[]>('/api/admin/audio/sources', signal);
export const setAudioUnavailable = (key: string, unavailable: boolean, signal: AbortSignal) => request(`/api/admin/audio/${encodeURIComponent(key)}/unavailable`, signal, 'PATCH', {unavailable});
export const setAudioRemovalRequested = (key: string, removalRequested: boolean, signal: AbortSignal) => request(`/api/admin/audio/${encodeURIComponent(key)}/removal-request`, signal, 'PATCH', {removalRequested});
export const sendTargetedMessage = (body: TargetedMessageDraft, signal: AbortSignal) => request<{id: number}>('/api/admin/targeted-messages', signal, 'POST', body);
