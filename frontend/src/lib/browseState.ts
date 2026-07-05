import type {DirectoryContents} from '@/lib/api';

const DIRECTORY_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedDirectory = {
    contents: DirectoryContents;
    expiresAt: number;
};

const directoryCache = new Map<string, CachedDirectory>();

export function getCachedDirectory(path: string): DirectoryContents | undefined {
    const cachedDirectory = directoryCache.get(path);

    if (!cachedDirectory) {
        return undefined;
    }

    if (cachedDirectory.expiresAt <= Date.now()) {
        directoryCache.delete(path);
        return undefined;
    }

    return cachedDirectory.contents;
}

export function cacheDirectory(path: string, contents: DirectoryContents) {
    const cachedDirectory = {
        contents,
        expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
    };

    directoryCache.set(path, cachedDirectory);

    if (contents.currentPath !== path) {
        directoryCache.set(contents.currentPath, cachedDirectory);
    }
}
