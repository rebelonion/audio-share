import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {IconButton} from '@/components/ui/Button';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';
import {ChevronLeft, ChevronRight, Music, Play, ShieldAlert} from 'lucide-react';
import type {TrackSummary} from '@/lib/api';
import {useRybbit} from '@/hooks/useRybbit';
import {useAudioPlayerCommands} from '@/contexts/AudioPlayerContext';
import {playbackToPlayerTrack, trackArtworkUrl} from '@/lib/tracks';
import TrackQuickActions from '@/components/TrackQuickActions';

interface TrackListSectionProps {
    title: string;
    tracks: TrackSummary[];
    source?: 'home' | 'share';
}

function TrackPoster({track}: {track: TrackSummary}) {
    const [imageError, setImageError] = useState(false);
    const imageUrl = imageError ? null : trackArtworkUrl(track);

    if (!imageUrl) {
        const bars = [14, 22, 18, 28, 20, 32, 24, 16, 26, 20, 12, 28, 22, 18, 30];
        return (
            <div
                className="w-full h-24 md:h-28 flex items-center justify-center relative overflow-hidden"
                style={{background: 'linear-gradient(135deg, var(--card) 0%, var(--secondary) 100%)'}}
            >
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    {bars.map((height, index) => (
                        <rect
                            key={index}
                            x={index * 8 + 4}
                            y={(56 - height) / 2}
                            width={3}
                            height={height}
                            rx={1.5}
                            fill="var(--primary)"
                            opacity={0.12}
                        />
                    ))}
                </svg>
                <Music className="h-7 w-7 relative z-10 text-[var(--muted-foreground)] opacity-50" />
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

export default function TrackListSection({title, tracks, source = 'home'}: TrackListSectionProps) {
    const {track: trackEvent} = useRybbit();
    const {playTrack} = useAudioPlayerCommands();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [needsScroll, setNeedsScroll] = useState(false);

    const updateScrollState = useCallback(() => {
        const element = scrollRef.current;
        if (!element) return;
        const scrollable = element.scrollWidth > element.clientWidth + 1;
        setNeedsScroll(scrollable);
        setCanScrollLeft(element.scrollLeft > 0);
        setCanScrollRight(scrollable && element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
    }, []);

    useEffect(() => {
        updateScrollState();
        window.addEventListener('resize', updateScrollState);
        return () => window.removeEventListener('resize', updateScrollState);
    }, [tracks, updateScrollState]);

    if (tracks.length === 0) return null;

    const scroll = (direction: 'left' | 'right') => {
        const element = scrollRef.current;
        if (!element) return;
        element.scrollBy({
            left: (direction === 'left' ? -1 : 1) * element.clientWidth * 0.75,
            behavior: 'smooth',
        });
    };

    const play = (track: TrackSummary) => {
        playTrack(playbackToPlayerTrack(track, source));
        trackEvent('carousel-play', {section: title, path: track.path, title: track.title || track.filename});
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-3 text-2xl font-bold italic tracking-tight">
                    <span className="inline-block w-1 h-6 bg-[var(--primary)] rounded-sm flex-shrink-0 not-italic opacity-85" />
                    {title}
                </h2>
                {needsScroll && (
                    <div className="flex gap-1">
                        <IconButton
                            onClick={() => scroll('left')}
                            disabled={!canScrollLeft}
                            variant="secondary" size="sm"
                            aria-label={`Scroll ${title} left`}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                            onClick={() => scroll('right')}
                            disabled={!canScrollRight}
                            variant="secondary" size="sm"
                            aria-label={`Scroll ${title} right`}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </IconButton>
                    </div>
                )}
            </div>

            <div
                ref={scrollRef}
                onScroll={updateScrollState}
                className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
            >
                {tracks.map((track, index) => (
                        <div
                            key={track.shareKey || track.path}
                            className="flex-shrink-0 w-44 snap-start group animate-fadeIn"
                            style={{animationDelay: `${index * 35}ms`, animationFillMode: 'both'}}
                        >
                            <Card padding="none" className="relative overflow-hidden group-hover:border-[var(--primary)] group-hover:shadow-[0_8px_20px_rgba(196,136,42,0.12)] transition-all duration-200">
                                <Link
                                    to={`/share/${track.shareKey}`}
                                    onClick={() => trackEvent('carousel-click', {
                                        section: title,
                                        path: track.path,
                                        title: track.title || track.filename,
                                    })}
                                    className="absolute inset-0 z-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
                                    aria-label={`Open ${track.title || track.filename}`}
                                />
                                <div className="relative pointer-events-none">
                                    <TrackPoster track={track} />
                                    {track.removalRequestedAt && (
                                        <Badge size="sm" variant="overlay" className="absolute right-2 top-2">
                                            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                                            Removal requested
                                        </Badge>
                                    )}
                                </div>
                                <div className="relative pointer-events-none p-2.5">
                                    <div className="min-h-10 font-medium text-sm leading-5 line-clamp-2 text-left group-hover:text-[var(--primary)] transition-colors">{track.title || track.filename}</div>
                                    <div className="text-xs text-[var(--muted-foreground)] truncate mt-1">{track.artist || track.parentFolderName || '\u00A0'}</div>
                                    <div className="relative z-10 mt-2 flex items-center justify-between pointer-events-auto">
                                        <TrackQuickActions track={playbackToPlayerTrack(track, source)} compact />
                                        <IconButton variant="subtle" size="sm"
                                            type="button"
                                            onClick={() => play(track)}
                                            title="Play"
                                            aria-label={`Play ${track.title || track.filename}`}
                                        >
                                            <Play className="h-3.5 w-3.5 fill-current" />
                                        </IconButton>
                                    </div>
                                </div>
                            </Card>
                        </div>
                ))}
            </div>
        </div>
    );
}
