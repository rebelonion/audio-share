
export interface AudioFile {
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
    type: 'audio';
    mimeType: string;
}

export interface Folder {
    name: string;
    path: string;
    modifiedAt: string;
    type: 'folder';
}

export type FileSystemItem = AudioFile | Folder;