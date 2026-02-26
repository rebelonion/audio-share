import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, Link } from 'react-router';
import { Home, Music, FolderOpen } from 'lucide-react';
import SharePagePlayer from '@/components/SharePagePlayer';
import { API_BASE, recordPlayEvent } from '@/lib/api';
import { DEFAULT_TITLE } from '@/lib/config';
import { useUmami } from '@/hooks/useUmami';

export default function Share() {
    const location = useLocation();
    const { track } = useUmami();
    const [notFound, setNotFound] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const hasTracked = useRef(false);

    // Extract source and path from URL
    // /share/source/path/to/file.mp3 -> source = "source", pathSegments = ["path", "to", "file.mp3"]
    const pathParts = location.pathname.replace(/^\/share\//, '').split('/');
    const source = pathParts[0] || '';
    const pathSegments = pathParts.slice(1);
    const encodedPath = pathSegments.join('/');
    const apiAudioPath = `${API_BASE}/api/audio/${source}/${encodedPath}`;

    const audioPath = decodeURIComponent(`${source}/${encodedPath}`);

    useEffect(() => {
        const checkFile = async () => {
            try {
                const response = await fetch(apiAudioPath, { method: 'HEAD' });
                if (!response.ok) {
                    setNotFound(true);
                }
            } catch (error) {
                console.error('Error checking file:', error);
                setNotFound(true);
            } finally {
                setIsLoading(false);
            }
        };

        checkFile();
    }, [apiAudioPath]);

    const fileName = pathSegments.length > 0
        ? decodeURIComponent(pathSegments[pathSegments.length - 1])
        : 'Unknown';

    const folderPath = pathSegments.length > 1
        ? `/browse/${source}/${pathSegments.slice(0, -1).join('/')}`
        : `/browse/${source}`;

    const handlePlay = useCallback(() => {
        if (hasTracked.current) return;
        hasTracked.current = true;
        track('audio-share-play', { path: audioPath });
        recordPlayEvent(audioPath).catch(() => {});
    }, [audioPath, track]);

    useEffect(() => {
        const title = isLoading
            ? `Loading... - ${DEFAULT_TITLE}`
            : notFound
                ? `Not Found - ${DEFAULT_TITLE}`
                : `${fileName} - ${DEFAULT_TITLE}`;
        document.title = title;
    }, [isLoading, notFound, fileName]);

    return (
        <>
            {isLoading ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--primary)] mb-4"></div>
                    <h1 className="text-xl font-semibold">Loading audio...</h1>
                </div>
            ) : notFound ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
                    <div className="text-red-500 mb-4">
                        <Music className="h-16 w-16 mx-auto" />
                    </div>
                    <h1 className="text-xl font-semibold mb-2">Audio not found</h1>
                    <p className="text-[var(--muted-foreground)] mb-6 text-center">
                        The audio file you're looking for might have been removed or doesn't exist.
                    </p>
                    <Link
                        to="/"
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors"
                    >
                        <Home className="h-4 w-4" />
                        Go to home page
                    </Link>
                </div>
            ) : (
                <div className="container mx-auto p-4 max-w-4xl">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg p-6 mb-8">
                        <h1 className="text-2xl font-bold mb-6 break-words line-clamp-4">
                            {fileName}
                        </h1>

                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                            <p className="text-[var(--muted-foreground)] mb-4 md:mb-0">
                                From directory: <span className="font-medium">{pathSegments.length > 1 ? decodeURIComponent(pathSegments[pathSegments.length - 2]) : decodeURIComponent(source)}</span>
                            </p>

                            <Link
                                to={folderPath}
                                className="px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-md flex items-center gap-2 transition-colors"
                            >
                                <FolderOpen className="h-5 w-5" />
                                <span className="font-medium">Browse Folder</span>
                            </Link>
                        </div>

                        <div className="bg-[var(--card-hover)]/40 rounded-lg p-6">
                            <SharePagePlayer src={`/audio/${source}/${encodedPath}`} onPlay={handlePlay} />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
