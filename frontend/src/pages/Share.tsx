import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { Home, Music, FolderOpen } from 'lucide-react';
import SharePagePlayer from '@/components/SharePagePlayer';
import TrackListSection from '@/components/TrackListSection';
import { API_BASE, recordPlayEvent, getRecommendations, PlaybackTrack } from '@/lib/api';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';

interface AudioMeta {
    title: string;
    artist: string;
    uploadDate: string;
    webpageUrl: string;
    description: string;
    parentPath: string;
    thumbnail: boolean;
    deleted: boolean;
    unavailableAt: string | null;
}

export default function Share() {
    const { key } = useParams<{ key: string }>();
    const [meta, setMeta] = useState<AudioMeta | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [recommendations, setRecommendations] = useState<PlaybackTrack[]>([]);
    const hasTracked = useRef(false);

    useEffect(() => {
        if (!key) {
            setNotFound(true);
            setIsLoading(false);
            return;
        }

        const fetchMeta = async () => {
            try {
                const response = await fetch(`${API_BASE}/api/audio/key/${key}/meta`);
                if (response.status === 404) {
                    setNotFound(true);
                } else if (response.ok) {
                    const data: AudioMeta = await response.json();
                    setMeta(data);
                } else {
                    setNotFound(true);
                }
            } catch {
                setNotFound(true);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMeta();

        getRecommendations(key).then(setRecommendations).catch(() => {});
    }, [key]);

    const handlePlay = useCallback(() => {
        if (hasTracked.current || !key) return;
        hasTracked.current = true;
        recordPlayEvent(key).catch(() => {});
    }, [key]);

    const displayTitle = meta?.title || key || 'Unknown';
    const folderPath = meta?.parentPath
        ? `/browse/${meta.parentPath.split('/').map(encodeURIComponent).join('/')}`
        : '/';
    const parentName = meta?.parentPath
        ? meta.parentPath.split('/').pop() || meta.parentPath
        : null;

    const pageTitle = isLoading
        ? `Loading... - ${DEFAULT_TITLE}`
        : notFound
            ? `Not Found - ${DEFAULT_TITLE}`
            : `${displayTitle} - ${DEFAULT_TITLE}`;

    const pageDescription = meta?.description
        ? meta.description
        : `${DEFAULT_DESCRIPTION} — ${displayTitle}`;

    return (
        <>
            <Helmet>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDescription} />
            </Helmet>
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
                        The audio file you're looking for doesn't exist.
                    </p>
                    <Link
                        to="/"
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors"
                    >
                        <Home className="h-4 w-4" />
                        Go to home page
                    </Link>
                </div>
            ) : meta?.deleted ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
                    <div className="text-[var(--muted-foreground)] mb-4">
                        <Music className="h-16 w-16 mx-auto" />
                    </div>
                    <h1 className="text-xl font-semibold mb-2">{displayTitle}</h1>
                    {meta.artist && (
                        <p className="text-[var(--muted-foreground)] mb-2">{meta.artist}</p>
                    )}
                    <p className="text-[var(--muted-foreground)] mb-6 text-center">
                        This audio has been removed.
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
                            {displayTitle}
                        </h1>

                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                            <p className="text-[var(--muted-foreground)] mb-4 md:mb-0">
                                {parentName && (
                                    <>From directory: <span className="font-medium">{decodeURIComponent(parentName)}</span></>
                                )}
                            </p>

                            {meta?.parentPath && (
                                <Link
                                    to={folderPath}
                                    className="px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-md flex items-center gap-2 transition-colors"
                                >
                                    <FolderOpen className="h-5 w-5" />
                                    <span className="font-medium">Browse Folder</span>
                                </Link>
                            )}
                        </div>

                        <div className="bg-[var(--card-hover)]/40 rounded-lg p-6">
                            <SharePagePlayer src={`/audio/key/${key}`} onPlay={handlePlay} unavailable={!!meta?.unavailableAt} />
                        </div>
                    </div>

                    {recommendations.length > 0 && (
                        <TrackListSection title="You Might Also Like" tracks={recommendations} />
                    )}
                </div>
            )}
        </>
    );
}
