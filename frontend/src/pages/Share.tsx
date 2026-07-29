import { useEffect, useState, type MouseEvent } from 'react';
import { useParams, Link } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { Calendar, Download, ExternalLink, FolderOpen, Home, Music, Unlink } from 'lucide-react';
import SharePagePlayer from '@/components/SharePagePlayer';
import TrackListSection from '@/components/TrackListSection';
import { API_BASE, getRecommendations, type TrackSummary } from '@/lib/api';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';
import { useMatureContentPreference } from '@/hooks/useMatureContentPreference';
import MatureContentDialog from '@/components/MatureContentDialog';
import { useRybbit } from '@/hooks/useRybbit';
import TrackQuickActions from '@/components/TrackQuickActions';
import {
    mediaAccessErrorMessage,
    startAudioDownload,
    type MediaAccessPhase,
} from '@/lib/mediaAccess';

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
    ageLimit?: number;
    isMature: boolean;
    showMature: boolean;
}

const WAVEFORM_BARS = [14, 22, 18, 28, 20, 32, 24, 16, 26, 20, 12, 28, 22, 18, 30, 24, 20, 26, 18, 32];

function formatUploadDate(value: string): string {
    if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    return value;
}

export default function Share() {
    const { key } = useParams<{ key: string }>();
    const { track } = useRybbit();
    const [meta, setMeta] = useState<AudioMeta | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [recommendations, setRecommendations] = useState<TrackSummary[]>([]);
    const [showDownloadDialog, setShowDownloadDialog] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadPhase, setDownloadPhase] = useState<MediaAccessPhase>('requesting');
    const maturePreference = useMatureContentPreference();

    useEffect(() => {
        const controller = new AbortController();
        setMeta(null);
        setNotFound(false);
        setIsLoading(true);
        setRecommendations([]);
        if (!key) {
            setNotFound(true);
            setIsLoading(false);
            return;
        }

        const fetchMeta = async () => {
            try {
                const response = await fetch(`${API_BASE}/api/audio/key/${key}/meta`, {
                    credentials: 'include',
                    signal: controller.signal,
                });
                if (response.status === 404) {
                    setNotFound(true);
                } else if (response.ok) {
                    const data: AudioMeta = await response.json();
                    setMeta(data);
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
                setNotFound(true);
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        };

        fetchMeta();

        getRecommendations(key, controller.signal).then(setRecommendations).catch(() => {});
        return () => controller.abort();
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
        ? (meta.isMature && !maturePreference.enabled ? `${DEFAULT_DESCRIPTION} · ${displayTitle}` : meta.description)
        : `${DEFAULT_DESCRIPTION} · ${displayTitle}`;
    const thumbnailView = meta?.isMature && !maturePreference.enabled ? 'blurred' : 'original';
    const thumbnailUrl = `${API_BASE}/api/audio/key/${key}/thumbnail?view=${thumbnailView}`;
    const trackDownload = () => {
        track('audio-download', {
            path: key,
            name: meta?.title || key || 'audio',
            source: 'share-page',
        });
    };

    const openDownload = async () => {
        if (!key || isDownloading) return;
        setIsDownloading(true);
        setDownloadPhase('requesting');
        setDownloadError(null);
        try {
            await startAudioDownload(key, setDownloadPhase);
            trackDownload();
        } catch (error) {
            setDownloadError(mediaAccessErrorMessage(error, 'download'));
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadClick = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        if (!meta?.isMature || meta.showMature || sessionStorage.getItem('mature-download-warning-ack') === 'true') {
            void openDownload();
            return;
        }
        setShowDownloadDialog(true);
    };

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
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg p-5 sm:p-6 mb-8 relative overflow-clip">
                        {meta?.thumbnail && (
                            <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                    backgroundImage: `url(${thumbnailUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    filter: 'blur(70px) brightness(0.5) saturate(1.5)',
                                    transform: 'scale(1.4)',
                                    opacity: 0.15,
                                }}
                            />
                        )}
                        <div className="relative">
                            <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-center">
                                <div className="aspect-video overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--secondary)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                                    {meta?.thumbnail ? (
                                        <img src={thumbnailUrl} alt={`${displayTitle} artwork`} className="h-full w-full object-cover" width={480} height={270} />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <Music className="h-10 w-10 text-[var(--primary)] opacity-45" />
                                        </div>
                                    )}
                                </div>

                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-start gap-3">
                                        <h1 className="min-w-0 text-3xl sm:text-4xl font-bold break-words line-clamp-4" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                                            {displayTitle}
                                        </h1>
                                        {meta?.isMature && (
                                            <span className="mt-1 px-2 py-0.5 rounded border border-amber-500/40 text-xs font-semibold text-amber-500 flex-shrink-0">18+</span>
                                        )}
                                    </div>

                                    {(meta?.artist || parentName) && (
                                        <p className="mt-3 text-base text-[var(--muted-foreground)]">
                                            {meta?.artist || decodeURIComponent(parentName || '')}
                                        </p>
                                    )}

                                    <div className="mt-5 flex flex-wrap items-center gap-3">
                                        {key && (
                                            <TrackQuickActions track={{
                                                src: `/audio/key/${key}`,
                                                shareKey: key,
                                                name: displayTitle,
                                                artist: meta?.artist,
                                                deleted: !!meta?.deleted,
                                                ageLimit: meta?.ageLimit,
                                                source: 'share',
                                            }} />
                                        )}
                                        <button
                                            type="button"
                                            disabled={isDownloading}
                                            onClick={handleDownloadClick}
                                            className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors disabled:opacity-60"
                                        >
                                            <Download className="h-4 w-4" /> {
                                                isDownloading
                                                    ? downloadPhase === 'verifying' ? 'Verifying download…' : 'Preparing download…'
                                                    : 'Download'
                                            }
                                        </button>
                                        {meta?.parentPath && (
                                            <Link to={folderPath} className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors">
                                                <FolderOpen className="h-4 w-4" /> Browse folder
                                            </Link>
                                        )}
                                        {downloadError && (
                                            <span className="basis-full text-sm text-[var(--error-text)]" role="alert">
                                                {downloadError}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <SharePagePlayer src={`/audio/key/${key}`} name={displayTitle} artist={meta?.artist} ageLimit={meta?.ageLimit} />
                            </div>

                            {(meta?.uploadDate || meta?.webpageUrl || meta?.description) && (
                                <div className="pt-6">
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-[var(--muted-foreground)]">
                                        {meta?.uploadDate && (
                                            <span className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {formatUploadDate(meta.uploadDate)}</span>
                                        )}
                                        {meta?.webpageUrl && (
                                            <a
                                                href={meta.webpageUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={() => track(
                                                    meta.unavailableAt ? 'external-link-broken-click' : 'external-link-click',
                                                    {
                                                        url: meta.webpageUrl,
                                                        track: displayTitle,
                                                        source: 'share-page',
                                                    },
                                                )}
                                                className={meta.unavailableAt
                                                    ? 'flex items-center gap-2 text-amber-400 transition-colors hover:text-amber-300'
                                                    : 'flex items-center gap-2 transition-colors hover:text-[var(--primary)]'
                                                }
                                            >
                                                {meta.unavailableAt ? <Unlink className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                                                {meta.unavailableAt ? 'Original source no longer available' : 'View original source'}
                                            </a>
                                        )}
                                    </div>

                                    {meta?.description && (!meta.isMature || meta.showMature) && (
                                        <div className="mt-5">
                                            <h2 className="mb-2 text-lg font-semibold">Description</h2>
                                            <p className="max-h-48 overflow-y-auto whitespace-pre-line rounded-lg bg-[var(--card-hover-subtle)] p-4 text-sm leading-relaxed text-[var(--muted-foreground)] custom-scrollbar">
                                                {meta.description}
                                            </p>
                                        </div>
                                    )}
                                    {meta?.description && meta.isMature && !meta.showMature && (
                                        <div className="mt-5 rounded-lg bg-[var(--card-hover-subtle)] p-4 text-sm text-[var(--muted-foreground)]">
                                            Description hidden for mature content.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {recommendations.length > 0 && (
                        <TrackListSection title="You Might Also Like" tracks={recommendations} source="share" />
                    )}
                </div>
            )}
            <MatureContentDialog
                open={showDownloadDialog}
                title="Mature content"
                description="This download is marked 18+. Continue download?"
                confirmLabel="Download"
                onCancel={() => setShowDownloadDialog(false)}
                onConfirm={() => {
                    sessionStorage.setItem('mature-download-warning-ack', 'true');
                    setShowDownloadDialog(false);
                    void openDownload();
                }}
            />
        </>
    );
}
