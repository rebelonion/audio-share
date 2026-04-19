import { useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { Music, ChevronLeft, ChevronRight } from 'lucide-react';
import { PlaybackTrack, API_BASE } from '@/lib/api';
import { useState } from 'react';
import { useRybbit } from '@/hooks/useRybbit';

interface TrackListSectionProps {
    title: string;
    tracks: PlaybackTrack[];
}

function TrackPoster({ track }: { track: PlaybackTrack }) {
    const [imageError, setImageError] = useState(false);

    // Use key-based thumbnail; fall back to key-based folder poster
    const thumbnailUrl = track.shareKey && track.audioImage
        ? `${API_BASE}/api/audio/key/${track.shareKey}/thumbnail`
        : null;
    const posterUrl = !thumbnailUrl && track.parentShareKey && track.posterImage
        ? `${API_BASE}/api/folder/key/${track.parentShareKey}/poster`
        : null;

    const imageUrl = imageError ? null : (thumbnailUrl || posterUrl);

    if (!imageUrl) {
        const bars = [14, 22, 18, 28, 20, 32, 24, 16, 26, 20, 12, 28, 22, 18, 30];
        return (
            <div
                className="w-full h-24 md:h-28 flex items-center justify-center relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--secondary) 100%)' }}
            >
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    {bars.map((h, i) => (
                        <rect
                            key={i}
                            x={i * 8 + 4}
                            y={(56 - h) / 2}
                            width={3}
                            height={h}
                            rx={1.5}
                            fill="var(--primary)"
                            opacity={0.12}
                        />
                    ))}
                </svg>
                <Music className="h-7 w-7 relative z-10" style={{ color: 'var(--muted-foreground)', opacity: 0.45 }} />
            </div>
        );
    }

    return (
        <img
            src={imageUrl}
            alt=""
            className="w-full h-24 md:h-28 object-cover"
            loading="lazy"
            onError={() => setImageError(true)}
        />
    );
}

function getShareUrl(track: PlaybackTrack): string {
    return `/share/${track.shareKey}`;
}

export default function TrackListSection({ title, tracks }: TrackListSectionProps) {
    const { track: trackEvent } = useRybbit();
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
                <h2 className="flex items-center gap-3 text-2xl font-bold italic tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                    <span className="inline-block w-1 h-6 bg-[var(--primary)] rounded-sm flex-shrink-0 not-italic" style={{ opacity: 0.85 }} />
                    {title}
                </h2>
                {needsScroll && <div className="flex gap-1">
                    <button
                        onClick={() => scroll('left')}
                        disabled={!canScrollLeft}
                        className="p-1.5 rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--card-hover)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        disabled={!canScrollRight}
                        className="p-1.5 rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--card-hover)] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
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
                {tracks.map((track, index) => (
                    <Link
                        key={track.shareKey || track.path}
                        to={getShareUrl(track)}
                        onClick={() => trackEvent('carousel-click', { section: title, path: track.path, title: track.title || track.filename })}
                        className="flex-shrink-0 w-36 md:w-44 snap-start group animate-fadeIn"
                        style={{ animationDelay: `${index * 35}ms`, animationFillMode: 'both' }}
                    >
                        <div className="rounded-lg overflow-hidden bg-[var(--card)] border border-[var(--border)] group-hover:border-[var(--primary)] group-hover:shadow-[0_8px_20px_rgba(196,136,42,0.12)] transition-all duration-200">
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
