import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import BrowseClient from '@/components/BrowseClient';
import TrackListSection from '@/components/TrackListSection';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';
import { PlaybackTrack, getRecentlyPlayed, getPopularTracks, getRecentlyAdded } from '@/lib/api';

export default function Home() {
    const [recentTracks, setRecentTracks] = useState<PlaybackTrack[]>([]);
    const [popularTracks, setPopularTracks] = useState<PlaybackTrack[]>([]);
    const [newTracks, setNewTracks] = useState<PlaybackTrack[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            getRecentlyPlayed().catch(() => []),
            getPopularTracks().catch(() => []),
            getRecentlyAdded().catch(() => []),
        ]).then(([recent, popular, added]) => {
            setRecentTracks(recent);
            setPopularTracks(popular);
            setNewTracks(added);
        }).finally(() => setLoading(false));
    }, []);

    const hasSections = !loading && (recentTracks.length > 0 || popularTracks.length > 0 || newTracks.length > 0);

    return (
        <>
            <Helmet>
                <title>{DEFAULT_TITLE} - Home</title>
                <meta name="description" content={DEFAULT_DESCRIPTION} />
            </Helmet>
            <BrowseClient showTitle={true} />
            {hasSections && (
                <div className="mt-8 space-y-8 pr-10 md:pr-12">
                    <TrackListSection title="Recently Played" tracks={recentTracks} />
                    <TrackListSection title="Popular" tracks={popularTracks} />
                    <TrackListSection title="Recently Added" tracks={newTracks} />
                </div>
            )}
        </>
    );
}
