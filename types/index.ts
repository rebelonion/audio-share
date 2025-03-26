
export interface AudioFile {
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
    type: 'audio';
    mimeType: string;
}

export interface FolderMetadata {
    folder_name: string;  // Directory name to map to
    name: string;         // Display name
    original_url?: string;
    items?: number;
    directory_size?: string;
    description?: string;
}

export interface Folder {
    name: string;
    path: string;
    modifiedAt: string;
    type: 'folder';
    metadata?: FolderMetadata;
}

export type FileSystemItem = AudioFile | Folder;