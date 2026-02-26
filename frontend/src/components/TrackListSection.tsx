import { useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { Music, ChevronLeft, ChevronRight } from 'lucide-react';
import { PlaybackTrack, API_BASE } from '@/lib/api';
import { useState } from 'react';
import { useUmami } from '@/hooks/useUmami';

interface TrackListSectionProps {
    title: string;
    tracks: PlaybackTrack[];
}

function TrackPoster({ track }: { track: PlaybackTrack }) {
    const [audioImageError, setAudioImageError] = useState(false);
    const [posterError, setPosterError] = useState(false);

    const encodedParent = track.parentPath
        ? track.parentPath.split('/').map(s => encodeURIComponent(s)).join('/')
        : null;
    const audioImageUrl = track.audioImage && encodedParent
        ? `${API_BASE}/api/audio/${encodedParent}/${encodeURIComponent(track.audioImage)}`
        : null;
    const posterUrl = track.posterImage && encodedParent
        ? `${API_BASE}/api/audio/${encodedParent}/${encodeURIComponent(track.posterImage)}`
        : null;

    const imageUrl = (audioImageUrl && !audioImageError)
        ? audioImageUrl
        : (posterUrl && !posterError)
            ? posterUrl
            : null;

    if (!imageUrl) {
        return (
            <div className="w-full h-24 md:h-28 bg-[var(--card-hover)] flex items-center justify-center">
                <Music className="h-8 w-8 text-[var(--muted-foreground)]" />
            </div>
        );
    }

    const handleError = () => {
        if (audioImageUrl && !audioImageError) {
            setAudioImageError(true);
        } else {
            setPosterError(true);
        }
    };

    return (
        <img
            src={imageUrl}
            alt=""
            className="w-full h-24 md:h-28 object-cover"
            loading="lazy"
            onError={handleError}
        />
    );
}

function getShareUrl(path: string): string {
    const encoded = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `/share/${encoded}`;
}

export default function TrackListSection({ title, tracks }: TrackListSectionProps) {
    const { track: trackEvent } = useUmami();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [needsScroll, setNeedsScroll] = useState(false);

    if (tracks.length === 0) return null;

    const updateScrollState = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const scrollable = el.scrollWidth > el.clientWidth + 1;
        setNeedsScroll(scrollable);
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(scrollable && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }, []);

    useEffect(() => {
        updateScrollState();
        window.addEventListener('resize', updateScrollState);
        return () => window.removeEventListener('resize', updateScrollState);
    }, [tracks, updateScrollState]);

    const scroll = (direction: 'left' | 'right') => {
        const el = scrollRef.current;
        if (!el) return;
        const scrollAmount = el.clientWidth * 0.75;
        el.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth',
        });
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">{title}</h2>
                {needsScroll && <div className="flex gap-1">
                    <button
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="p-1.5 rounded-md bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--card-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="p-1.5 rounded-md bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--card-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>}
            </div>

            <div
                ref={scrollRef}
                onScroll={updateScrollState}
                className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
            >
                {tracks.map((track) => (
                    <Link
                        key={track.path}
                        to={getShareUrl(track.path)}
                        onClick={() => trackEvent('carousel-click', { section: title, path: track.path, title: track.title || track.filename })}
                        className="flex-shrink-0 w-36 md:w-44 snap-start group"
                    >
                        <div className="rounded-lg overflow-hidden bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors">
                            <TrackPoster track={track} />
                            <div className="p-2.5">
                                <div className="font-medium text-sm line-clamp-2 group-hover:text-[var(--primary)] transition-colors">
                                    {track.title || track.filename}
                                </div>
                                <div className="text-xs text-[var(--muted-foreground)] truncate mt-1">
                                    {track.artist || track.parentFolderName || '\u00A0'}
                                </div>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
