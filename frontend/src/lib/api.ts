export const API_BASE = import.meta.env.VITE_API_URL || '';

export type { FileSystemItem, FolderMetadata, AudioFile, Folder } from '@/types';
import type { FileSystemItem } from '@/types';

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

    // Folder fields
    originalUrl?: string;
    itemCount?: number;
    directorySize?: string;
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

export async function recordPlayEvent(shareKey: string): Promise<void> {
    await fetch(`${API_BASE}/api/playback/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareKey }),
    });
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

export async function searchAudio(query: string, limit?: number, offset?: number): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (limit) {
        params.set('limit', limit.toString());
    }
    if (offset) {
        params.set('offset', offset.toString());
    }

    const response = await fetch(`${API_BASE}/api/search?${params}`);
    if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
    }
    return response.json();
}
