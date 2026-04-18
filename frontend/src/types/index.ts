
export interface AudioFile {
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
    type: 'audio';
    mimeType: string;
    title?: string;
    shareKey?: string;
    unavailableAt?: string;
}

export interface FolderMetadata {
    folder_name: string;  // Directory name to map to
    name: string;         // Display name
    original_url?: string;
    url_broken?: boolean;
    items?: number;
    description?: string;
}

export interface Folder {
    name: string;
    path: string;
    size?: number;        // sum of child audio file sizes in bytes
    modifiedAt: string;
    type: 'folder';
    metadata?: FolderMetadata;
    posterImage?: string;
    shareKey?: string;
}

export type Notification = {
    path: string;
    message: string;
    isError: boolean;
    visible: boolean;
}

export type FileSystemItem = AudioFile | Folder;

export interface Tag {
    name: string;
    color: string;
}

export type RequestStatus = 'requested' | 'downloading' | 'indexing' | 'added' | 'rejected';

export interface SourceRequest {
    id: number;
    submittedUrl: string;
    title: string;
    status: RequestStatus;
    tags: Tag[];
    folderShareKey?: string;
    folderPath?: string;
    createdAt: string;
    updatedAt: string;
}

export interface RequestsByStatus {
    requested: SourceRequest[];
    downloading: SourceRequest[];
    indexing: SourceRequest[];
    added: SourceRequest[];
    rejected: SourceRequest[];
}
