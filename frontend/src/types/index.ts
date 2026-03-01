
export interface AudioFile {
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
    type: 'audio';
    mimeType: string;
    shareKey?: string;
}

export interface FolderMetadata {
    folder_name: string;  // Directory name to map to
    name: string;         // Display name
    original_url?: string;
    url_broken?: boolean;
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
    canonicalId?: string;
    title: string;
    imageUrl?: string;
    status: RequestStatus;
    tags: Tag[];
    folderShareKey?: string;
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
