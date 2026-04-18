import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { Home, FolderOpen, Download } from 'lucide-react';
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

const WAVEFORM_BARS = [14, 22, 18, 28, 20, 32, 24, 16, 26, 20, 12, 28, 22, 18, 30, 24, 20, 26, 18, 32];

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
                    <div className="flex items-end gap-1 mb-8" aria-hidden="true">
                        {WAVEFORM_BARS.slice(0, 9).map((h, i) => (
                            <div
                                key={i}
                                className="w-1 rounded-full"
                                style={{
                                    height: `${h}px`,
                                    background: 'var(--primary)',
                                    opacity: 0.5,
                                    animation: `pulse 1.1s ease-in-out ${i * 0.1}s infinite alternate`,
                                }}
                            />
                        ))}
                    </div>
                    <p className="text-xl italic text-[var(--muted-foreground)]" style={{ fontFamily: 'var(--font-display)' }}>
                        Loading audio...
                    </p>
                </div>
            ) : notFound ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
                    <p className="text-[0.65rem] uppercase tracking-[0.22em] text-[var(--muted-foreground)] mb-3">404</p>
                    <h1 className="text-5xl font-bold italic mb-4" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                        Not Found
                    </h1>
                    <p className="text-[var(--muted-foreground)] mb-8 max-w-xs leading-relaxed">
                        The audio file you're looking for doesn't exist or may have been removed.
                    </p>
                    <Link
                        to="/"
                        className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm"
                    >
                        <Home className="h-4 w-4" />
                        Go to home page
                    </Link>
                </div>
            ) : meta?.deleted ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
                    <p className="text-[0.65rem] uppercase tracking-[0.22em] text-[var(--muted-foreground)] mb-3">Unavailable</p>
                    <h1 className="text-5xl font-bold italic mb-3 break-words max-w-2xl" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                        {displayTitle}
                    </h1>
                    {meta.artist && (
                        <p className="text-[var(--muted-foreground)] mb-3 text-lg italic" style={{ fontFamily: 'var(--font-display)' }}>
                            {meta.artist}
                        </p>
                    )}
                    <p className="text-[var(--muted-foreground)] mb-8 text-sm">
                        This audio has been removed.
                    </p>
                    <Link
                        to="/"
                        className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm"
                    >
                        <Home className="h-4 w-4" />
                        Go to home page
                    </Link>
                </div>
            ) : (
                <div className="container mx-auto p-4 max-w-4xl animate-slideUp">
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg p-6 mb-8 relative overflow-hidden">
                        {meta?.thumbnail && (
                            <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                    backgroundImage: `url(${API_BASE}/api/audio/key/${key}/thumbnail)`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    filter: 'blur(70px) brightness(0.5) saturate(1.5)',
                                    transform: 'scale(1.4)',
                                    opacity: 0.15,
                                }}
                            />
                        )}
                        <div className="relative">
                        <h1 className="text-3xl sm:text-4xl font-bold mb-4 break-words line-clamp-4" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                            {displayTitle}
                        </h1>

                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                            <p className="text-[var(--muted-foreground)] mb-4 md:mb-0">
                                {parentName && (
                                    <span className="font-medium">{decodeURIComponent(parentName)}</span>
                                )}
                            </p>

                            <div className="flex items-center gap-3">
                                <a
                                    href={`${API_BASE}/api/audio/key/${key}`}
                                    download={meta?.title || key}
                                    className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors"
                                >
                                    <Download className="h-4 w-4" />
                                    <span>Download</span>
                                </a>
                                {meta?.parentPath && (
                                    <Link
                                        to={folderPath}
                                        className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors"
                                    >
                                        <FolderOpen className="h-4 w-4" />
                                        <span>Browse folder</span>
                                    </Link>
                                )}
                            </div>
                        </div>

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
