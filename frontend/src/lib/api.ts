import {syncRybbitIdentity} from '@/lib/rybbitIdentity';

export type { FileSystemItem, FolderMetadata, AudioFile, Folder, Tag, RequestStatus, SourceRequest, RequestsByStatus } from '@/types';
import type { FileSystemItem, RequestsByStatus } from '@/types';

export const API_BASE = import.meta.env.VITE_API_URL || '';

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
    ageLimit?: number;
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

export interface TrackSummary {
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
    ageLimit?: number;
}

export interface PlaybackStatsTrack extends TrackSummary {
    playCount: number;
    lastPlayed: string | null;
}

export interface UnavailableTrack extends TrackSummary {
    unavailableAt: string;
}

export interface LikedTrack extends TrackSummary {
    unavailableAt?: string | null;
    deleted: boolean;
}

interface LikesResponse {
    profileId: string;
    hasRecoveryKey: boolean;
    shareKeys: string[];
}

interface LikedTracksResponse {
    tracks: LikedTrack[];
}

export function isMatureAge(ageLimit?: number | null): boolean {
    return typeof ageLimit === 'number' && ageLimit >= 18;
}

export async function getMatureContentPreference(): Promise<boolean> {
    const response = await fetch(`${API_BASE}/api/preferences/mature-content`, {
        credentials: 'include',
    });
    if (!response.ok) throw new Error(`Failed to fetch mature preference: ${response.status}`);
    const data = await response.json();
    return !!data.enabled;
}

export async function setMatureContentPreference(enabled: boolean): Promise<boolean> {
    const response = await fetch(`${API_BASE}/api/preferences/mature-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
    });
    if (!response.ok) throw new Error(`Failed to update mature preference: ${response.status}`);
    const data = await response.json();
    return !!data.enabled;
}

function listeningSessionId(): string {
    const storageKey = 'audio-share:listening-session';
    let value = sessionStorage.getItem(storageKey);
    if (!value) {
        value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(storageKey, value);
    }
    return value;
}

export async function recordPlayEvent(
    shareKey: string,
    accessKey: string,
    origin = 'unknown',
): Promise<void> {
    const response = await fetch(`${API_BASE}/api/playback/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            shareKey,
            origin,
            accessKey,
            listeningSessionId: listeningSessionId(),
        }),
    });
    if (!response.ok) throw new Error(`Failed to record playback: ${response.status}`);
    const data = await response.json();
    syncRybbitIdentity(data.sessionId);
}

export async function createRecoveryKey(): Promise<string> {
    const response = await fetch(`${API_BASE}/api/profile/recovery-key`, {
        method: 'POST',
        credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to create recovery key');
    const data = await response.json();
    return data.recoveryKey;
}

export async function recoverBrowserProfile(recoveryKey: string): Promise<string> {
    const response = await fetch(`${API_BASE}/api/profile/recover`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({recoveryKey}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Failed to recover likes');
    if (typeof data.profileId !== 'string' || !data.profileId) throw new Error('Failed to recover likes');
    return data.profileId;
}

export async function getLikes(signal?: AbortSignal): Promise<LikesResponse> {
    const response = await fetch(`${API_BASE}/api/likes`, {credentials: 'include', signal});
    if (!response.ok) throw new Error('Failed to load likes');
    return response.json();
}

export async function getLikedTracks(signal?: AbortSignal): Promise<LikedTrack[]> {
    const response = await fetch(`${API_BASE}/api/likes/tracks`, {credentials: 'include', signal});
    if (!response.ok) throw new Error('Failed to load liked tracks');
    const data = await response.json() as LikedTracksResponse;
    return data.tracks;
}

export async function setTrackLiked(shareKey: string, liked: boolean, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${API_BASE}/api/likes/${encodeURIComponent(shareKey)}`, {
        method: liked ? 'PUT' : 'DELETE',
        credentials: 'include',
        signal,
    });
    if (!response.ok) throw new Error('Failed to update like');
}

export async function getRecommendations(shareKey: string, signal?: AbortSignal): Promise<TrackSummary[]> {
    const response = await fetch(`${API_BASE}/api/playback/recommendations/${encodeURIComponent(shareKey)}`, {signal});
    if (!response.ok) throw new Error(`Failed to fetch recommendations: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getRecentlyPlayed(): Promise<PlaybackStatsTrack[]> {
    const response = await fetch(`${API_BASE}/api/playback/recent`);
    if (!response.ok) throw new Error(`Failed to fetch recent tracks: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getPopularTracks(): Promise<PlaybackStatsTrack[]> {
    const response = await fetch(`${API_BASE}/api/playback/popular`);
    if (!response.ok) throw new Error(`Failed to fetch popular tracks: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getRecentlyAdded(): Promise<TrackSummary[]> {
    const response = await fetch(`${API_BASE}/api/playback/new`);
    if (!response.ok) throw new Error(`Failed to fetch new tracks: ${response.status}`);
    const data = await response.json();
    return data.tracks;
}

export async function getRecentlyUnavailable(): Promise<UnavailableTrack[]> {
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
    root?: string;
    includeMature?: boolean;
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
        if (filters.root) params.set('root', filters.root);
        if (filters.includeMature) params.set('includeMature', 'true');
    }

    const response = await fetch(`${API_BASE}/api/search?${params}`);
    if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
    }
    return response.json();
}

export async function getRandomAudioFromSearch(query: string, filters: SearchFilters = {}): Promise<string | null> {
    if (filters.type === 'folder') return null;

    const audioFilters: SearchFilters = { ...filters, type: 'audio' };
    const firstMatch = await searchAudio(query, 1, 0, audioFilters);
    if (firstMatch.total === 0) return null;

    const randomOffset = Math.floor(Math.random() * firstMatch.total);
    const match = randomOffset === 0
        ? firstMatch.results[0]
        : (await searchAudio(query, 1, randomOffset, audioFilters)).results[0];

    return match?.shareKey || null;
}

export async function fetchRequests(): Promise<RequestsByStatus> {
    const response = await fetch(`${API_BASE}/api/requests`);
    if (!response.ok) {
        throw new Error(`Failed to fetch requests: ${response.status}`);
    }
    return response.json();
}
