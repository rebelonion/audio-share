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
