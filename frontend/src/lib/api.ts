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

export function getAudioUrl(path: string): string {
    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `${API_BASE}/api/audio/${encodedPath}`;
}

export interface SearchResult {
    id: number;
    name: string;
    path: string;
    type: 'audio' | 'folder';
    parentPath?: string;

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
