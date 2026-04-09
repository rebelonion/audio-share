import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import BrowseClient from '@/components/BrowseClient';
import TrackListSection from '@/components/TrackListSection';
import UnavailableBanner from '@/components/UnavailableBanner';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';
import { PlaybackTrack, getRecentlyPlayed, getPopularTracks, getRecentlyAdded, getRecentlyUnavailable } from '@/lib/api';

export default function Home() {
    const [recentTracks, setRecentTracks] = useState<PlaybackTrack[]>([]);
    const [popularTracks, setPopularTracks] = useState<PlaybackTrack[]>([]);
    const [newTracks, setNewTracks] = useState<PlaybackTrack[]>([]);
    const [unavailableTracks, setUnavailableTracks] = useState<PlaybackTrack[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            getRecentlyPlayed().catch(() => []),
            getPopularTracks().catch(() => []),
            getRecentlyAdded().catch(() => []),
            getRecentlyUnavailable().catch(() => []),
        ]).then(([recent, popular, added, unavailable]) => {
            setRecentTracks(recent);
            setPopularTracks(popular);
            setNewTracks(added);
            setUnavailableTracks(unavailable);
        }).finally(() => setLoading(false));
    }, []);

    const hasSections = !loading && (recentTracks.length > 0 || popularTracks.length > 0 || newTracks.length > 0);

    return (
        <>
            <Helmet>
                <title>{DEFAULT_TITLE} - Home</title>
                <meta name="description" content={DEFAULT_DESCRIPTION} />
            </Helmet>
            <div className="max-w-7xl mx-auto">
                <h1 className="sr-only">{DEFAULT_TITLE}</h1>
                <BrowseClient showTitle={true} />
                {!loading && unavailableTracks.length > 0 && (
                    <div className="mt-8">
                        <UnavailableBanner tracks={unavailableTracks} />
                    </div>
                )}
                {hasSections && (
                    <div className="mt-8 space-y-8">
                        <TrackListSection title="Recently Played" tracks={recentTracks} />
                        <TrackListSection title="Popular" tracks={popularTracks} />
                        <TrackListSection title="Recently Added" tracks={newTracks} />
                    </div>
                )}
            </div>
        </>
    );
}
