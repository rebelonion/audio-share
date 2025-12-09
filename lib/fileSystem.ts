import fs from 'fs';
import path from 'path';
import {promisify} from 'util';
import {FileSystemItem, FolderMetadata} from '@/types';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

interface AudioDirConfig {
    path: string;        // Actual filesystem path
    name: string;        // Display name
    slug: string;        // URL-friendly slug for routing
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with hyphens
        .replace(/[^a-z0-9\-]/g, '')    // Remove non-alphanumeric characters
        .replace(/-+/g, '-')            // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens
}

function createUniqueSlug(name: string, existingSlugs: Set<string>): string {
    let slug = slugify(name);
    if (!slug) slug = 'audio'; // Fallback for empty slugs
    
    let uniqueSlug = slug;
    let counter = 1;
    
    while (existingSlugs.has(uniqueSlug)) {
        uniqueSlug = `${slug}-${counter}`;
        counter++;
    }
    
    return uniqueSlug;
}

const getAudioDirs = (): AudioDirConfig[] => {
    const defaultDir = path.join(process.cwd(), 'public', 'audio');
    const existingSlugs = new Set<string>();
    
    if (!process.env.AUDIO_DIR) {
        const name = 'Audio';
        const slug = 'audio';
        existingSlugs.add(slug);
        return [{ path: defaultDir, name, slug }];
    }

    const dirConfigs = process.env.AUDIO_DIR.split(',')
        .map(dirConfig => {
            const parts = dirConfig.trim().split(':');
            let dirPath: string;
            let name: string;
            
            if (parts.length > 1 && parts[0].trim() !== '') {
                // Format is "path:name"
                dirPath = parts[0].trim();
                name = parts[1].trim() || path.basename(dirPath);
            } else if (parts[0].trim() !== '') {
                // Just the path
                dirPath = parts[0].trim();
                name = path.basename(dirPath);
            } else {
                return null;
            }
            
            const slug = createUniqueSlug(name, existingSlugs);
            existingSlugs.add(slug);
            
            return { path: dirPath, name, slug };
        })
        .filter(dir => dir !== null) as AudioDirConfig[];
    
    if (dirConfigs.length === 0) {
        const name = 'Audio';
        const slug = 'audio';
        return [{ path: defaultDir, name, slug }];
    }
    
    return dirConfigs;
};

const AUDIO_DIRS = getAudioDirs();

export function getSlugToDirectoryMap(): Record<string, AudioDirConfig> {
    const slugMap: Record<string, AudioDirConfig> = {};
    
    AUDIO_DIRS.forEach(dir => {
        slugMap[dir.slug] = dir;
    });
    
    return slugMap;
}

export async function getDirectoryContents(
    dirPath: string = ''
): Promise<{ 
    items: FileSystemItem[]; 
    currentPath: string;
}> {
    const decodedPath = decodeURIComponent(dirPath);
    const items: FileSystemItem[] = [];
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.opus'];
    const slugToDir = getSlugToDirectoryMap();
    
    // If we're at the root level, show each audio directory as a folder
    if (decodedPath === '') {
        for (const dirConfig of AUDIO_DIRS) {
            try {
                const dirStats = await stat(dirConfig.path);
                if (dirStats.isDirectory()) {
                    items.push({
                        name: dirConfig.name,
                        path: dirConfig.slug,
                        modifiedAt: dirStats.mtime.toISOString(),
                        type: 'folder',
                    });
                }
            } catch (error) {
                console.error(`Error accessing directory ${dirConfig.path}:`, error);
            }
        }

        items.sort((a, b) => a.name.localeCompare(b.name));
        
        return { 
            items, 
            currentPath: decodedPath
        };
    }

    try {
        const pathParts = decodedPath.split('/');
        const dirSlug = pathParts[0];
        
        if (!slugToDir[dirSlug]) {
            return {
                items: [],
                currentPath: decodedPath
            };
        }

        const targetDir = slugToDir[dirSlug].path;
        
        // Get the relative path within the directory (everything after the slug)
        let relativePath = '';
        if (pathParts.length > 1) {
            relativePath = pathParts.slice(1).join('/');
        }

        const normalizedPath = path.normalize(relativePath);
        if (normalizedPath.startsWith('..') || normalizedPath.startsWith('/') || 
            normalizedPath.includes('/../') || normalizedPath.endsWith('/..')) {
            console.error('Directory traversal attempt blocked:', decodedPath);
            return {
                items: [],
                currentPath: decodedPath
            };
        }
        
        const fullPath = path.join(targetDir, normalizedPath);
        const files = await readdir(fullPath);

        let folderMetadataList: FolderMetadata[] = [];
        const folderMetadataPath = path.join(fullPath, 'folder.json');
        try {
            if (fs.existsSync(folderMetadataPath)) {
                const metadataContent = await readFile(folderMetadataPath, 'utf-8');
                folderMetadataList = JSON.parse(metadataContent);
            }
        } catch (error) {
            console.error(`Error reading folder metadata from ${folderMetadataPath}:`, error);
        }

        for (const file of files) {
            if (file.startsWith('.')) continue;

            const filePath = path.join(fullPath, file);
            const stats = await stat(filePath);
            const virtualPath = decodedPath ? path.join(decodedPath, file) : file;
            const ext = path.extname(file).toLowerCase();

            if (stats.isDirectory()) {
                const folderMetadata = folderMetadataList.find(
                    (item: FolderMetadata) => item.folder_name === file
                );

                const displayName = folderMetadata?.name || file;

                const posterPath = path.join(filePath, 'poster.jpg');
                const hasPoster = fs.existsSync(posterPath);

                items.push({
                    name: displayName,
                    path: virtualPath,
                    modifiedAt: stats.mtime.toISOString(),
                    type: 'folder',
                    metadata: folderMetadata,
                    hasPoster
                });
            }
            else if (audioExts.includes(ext)) {
                let mimeType = 'audio/mpeg'; // Default
                if (ext === '.wav') mimeType = 'audio/wav';
                if (ext === '.ogg') mimeType = 'audio/ogg';
                if (ext === '.flac') mimeType = 'audio/flac';
                if (ext === '.aac') mimeType = 'audio/aac';
                if (ext === '.m4a') mimeType = 'audio/mp4';
                if (ext === '.opus') mimeType = 'audio/opus';

                items.push({
                    name: file,
                    path: virtualPath,
                    size: stats.size,
                    modifiedAt: stats.mtime.toISOString(),
                    type: 'audio',
                    mimeType,
                });
            }
            // All other file types are skipped
        }

        // Sort: folders first, then files, folders alphabetically, files by modified date
        items.sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            if (a.type === 'folder' && b.type === 'folder') return a.name.localeCompare(b.name);
            return b.modifiedAt.localeCompare(a.modifiedAt);
        });

        return {
            items, 
            currentPath: decodedPath
        };
    } catch (error) {
        console.error('Error reading directory:', error);
        return {
            items: [], 
            currentPath: decodedPath
        };
    }
}