import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router';
import { Unlink, Music, ChevronLeft, ChevronRight } from 'lucide-react';
import { PlaybackTrack, API_BASE } from '@/lib/api';
import { useUmami } from '@/hooks/useUmami';

interface Props {
    tracks: PlaybackTrack[];
}

const INTERVAL_MS = 5000;

function TrackImage({ track }: { track: PlaybackTrack }) {
    const [imageError, setImageError] = useState(false);

    const thumbnailUrl = track.shareKey && track.audioImage
        ? `${API_BASE}/api/audio/key/${track.shareKey}/thumbnail`
        : null;
    const posterUrl = !thumbnailUrl && track.parentShareKey && track.posterImage
        ? `${API_BASE}/api/folder/key/${track.parentShareKey}/poster`
        : null;

    const imageUrl = imageError ? null : (thumbnailUrl || posterUrl);

    if (!imageUrl) {
        return (
            <div className="w-full h-full bg-amber-500/10 flex items-center justify-center">
                <Music className="h-8 w-8 text-amber-500/50" />
            </div>
        );
    }

    return (
        <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
        />
    );
}

export default function UnavailableBanner({ tracks }: Props) {
    const { track: trackEvent } = useUmami();
    const [index, setIndex] = useState(0);
    const [fading, setFading] = useState(false);
    const paused = useRef(false);

    const goTo = useCallback((next: number) => {
        setFading(true);
        setTimeout(() => {
            setIndex((next + tracks.length) % tracks.length);
            setFading(false);
        }, 200);
    }, [tracks.length]);

    const advance = useCallback(() => {
        goTo(index + 1);
    }, [goTo, index]);

    useEffect(() => {
        if (tracks.length <= 1) return;
        const id = setInterval(() => {
            if (!paused.current) advance();
        }, INTERVAL_MS);
        return () => clearInterval(id);
    }, [advance, tracks.length]);

    if (tracks.length === 0) return null;

    const track = tracks[index];
    const displayTitle = track.title || track.filename;

    return (
        <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3">Unavailable Sources</h2>
        <div
            className="group rounded-lg border border-[var(--border)] bg-amber-500/5 hover:bg-amber-500/10 transition-colors overflow-hidden"
            onMouseEnter={() => { paused.current = true; }}
            onMouseLeave={() => { paused.current = false; }}
        >
            <Link
                to={`/share/${track.shareKey}`}
                onClick={() => trackEvent('carousel-click', { section: 'Unavailable Sources', path: track.path, title: track.title || track.filename })}
                className={`flex gap-4 p-4 transition-opacity duration-200 ${fading ? 'opacity-0' : 'opacity-100'}`}
            >
                <div className="flex-shrink-0 w-36 aspect-video rounded-md overflow-hidden">
                    <TrackImage track={track} />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium mb-1.5">
                        <Unlink className="h-3 w-3 flex-shrink-0" />
                        Original source no longer available
                    </div>
                    <h3 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors truncate leading-snug">
                        {displayTitle}
                    </h3>
                    {track.artist && (
                        <p className="text-sm text-[var(--muted-foreground)] truncate mt-0.5">{track.artist}</p>
                    )}
                </div>
            </Link>

            {tracks.length > 1 && (
                <div className="flex items-center justify-between px-4 pb-3">
                    <div className="flex gap-1.5 items-center">
                        {tracks.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                    i === index
                                        ? 'w-4 bg-amber-500'
                                        : 'w-1.5 bg-amber-500/30 hover:bg-amber-500/60'
                                }`}
                            />
                        ))}
                    </div>
                    <div className="flex gap-0.5">
                        <button
                            onClick={() => goTo(index - 1)}
                            className="p-1 rounded hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => goTo(index + 1)}
                            className="p-1 rounded hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
        </div>
    );
}
