export const API_BASE = import.meta.env.VITE_API_URL || '';

export type { FileSystemItem, FolderMetadata, AudioFile, Folder, Tag, RequestStatus, SourceRequest, RequestsByStatus } from '@/types';
import type { FileSystemItem, RequestsByStatus } from '@/types';

export interface DirectoryContents {
    items: FileSystemItem[];
    currentPath: string;
}

export async function fetchDirectoryContents(path: string = ''): Promise<DirectoryContents> {
    let url = `${API_BASE}/api/browse`;
    if (path) {
        const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
        url = `${API_BASE}/api/browse/${encodedPath}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch directory: ${response.status}`);
    }
    return response.json();
}


export interface SearchResult {
    id: number;
    name: string;
    path: string;
    type: 'audio' | 'folder';
    parentPath?: string;
    shareKey?: string;

    // Audio fields
    size?: number;
    mimeType?: string;
    title?: string;
    artist?: string;
    description?: string;
    webpageUrl?: string;
    unavailableAt?: string;

    // Folder fields
    originalUrl?: string;
    itemCount?: number;
    directorySize?: number;
    posterImage?: string;

    modifiedAt?: string;
}

export interface SearchResponse {
    results: SearchResult[];
    query: string;
    count: number;
    total: number;
    offset: number;
    limit: number;
}

export interface PlaybackTrack {
    shareKey: string;
    path: string;
    filename: string;
    title: string | null;
    artist: string | null;
    parentPath: string | null;
    parentFolderName: string | null;
    parentShareKey: string | null;
    audioImage: string | null;
    posterImage: string | null;
    playCount: number;
    lastPlayed: string | null;
}

function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export function getSessionId(): string {
    let id = localStorage.getItem('audio_session_id');
    if (!id) {
        id = generateId();
        localStorage.setItem('audio_session_id', id);
    }
    return id;
}

export async function recordPlayEvent(shareKey: string): Promise<void> {
    await fetch(`${API_BASE}/api/playback/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareKey, sessionId: getSessionId() }),
    });
}

export async function getRecommendations(shareKey: string): Promise<PlaybackTrack[]> {
    const response = await fetch(`${API_BASE}/api/playback/recommendations/${shareKey}`);
    if (!response.ok) throw new Error(`Failed to fetch recommendations: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getRecentlyPlayed(): Promise<PlaybackTrack[]> {
    const response = await fetch(`${API_BASE}/api/playback/recent`);
    if (!response.ok) throw new Error(`Failed to fetch recent tracks: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getPopularTracks(): Promise<PlaybackTrack[]> {
    const response = await fetch(`${API_BASE}/api/playback/popular`);
    if (!response.ok) throw new Error(`Failed to fetch popular tracks: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getRecentlyAdded(): Promise<PlaybackTrack[]> {
    const response = await fetch(`${API_BASE}/api/playback/new`);
    if (!response.ok) throw new Error(`Failed to fetch new tracks: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getRecentlyUnavailable(): Promise<PlaybackTrack[]> {
    const response = await fetch(`${API_BASE}/api/playback/unavailable`);
    if (!response.ok) throw new Error(`Failed to fetch unavailable tracks: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getRandomAudio(): Promise<string> {
    const response = await fetch(`${API_BASE}/api/audio/random`);
    if (!response.ok) throw new Error(`Failed to fetch random audio: ${response.status}`);
    const data = await response.json();
    return data.shareKey;
}

export type SearchField = 'filename' | 'title' | 'artist' | 'description';

export interface SearchFilters {
    type?: 'audio' | 'folder';
    unavailableOnly?: boolean;
    sort?: 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc';
    dateFrom?: string;
    dateTo?: string;
    durationMin?: number;
    durationMax?: number;
    /** Which audio fields to search in. Empty/undefined = all fields. */
    fields?: SearchField[];
}

export async function searchAudio(query: string, limit?: number, offset?: number, filters?: SearchFilters): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (limit) {
        params.set('limit', limit.toString());
    }
    if (offset) {
        params.set('offset', offset.toString());
    }
    if (filters) {
        if (filters.type) params.set('type', filters.type);
        if (filters.unavailableOnly) params.set('unavailableOnly', 'true');
        if (filters.sort) params.set('sort', filters.sort);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        if (filters.durationMin != null && filters.durationMin > 0) params.set('durationMin', filters.durationMin.toString());
        if (filters.durationMax != null && filters.durationMax > 0) params.set('durationMax', filters.durationMax.toString());
        if (filters.fields && filters.fields.length > 0) params.set('fields', filters.fields.join(','));
    }

    const response = await fetch(`${API_BASE}/api/search?${params}`);
    if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
    }
    return response.json();
}

export async function fetchRequests(): Promise<RequestsByStatus> {
    const response = await fetch(`${API_BASE}/api/requests`);
    if (!response.ok) {
        throw new Error(`Failed to fetch requests: ${response.status}`);
    }
    return response.json();
}
