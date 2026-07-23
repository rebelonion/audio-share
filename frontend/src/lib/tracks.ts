import type {AudioPlayerTrack} from '@/contexts/AudioPlayerContext';
import {API_BASE, type TrackSummary} from '@/lib/api';
import type {AudioFile} from '@/types';

interface TrackArtwork {
    shareKey: string;
    audioImage?: string | null;
    parentShareKey?: string | null;
    posterImage?: string | null;
}

export function trackArtworkUrl(track: TrackArtwork): string | null {
    return trackArtworkUrls(track)[0] ?? null;
}

export function trackArtworkUrls(track: TrackArtwork): string[] {
    const urls: string[] = [];
    if (track.audioImage) {
        urls.push(`${API_BASE}/api/audio/key/${track.shareKey}/thumbnail`);
    }
    if (track.parentShareKey && track.posterImage) {
        urls.push(`${API_BASE}/api/folder/key/${track.parentShareKey}/poster`);
    }
    return urls;
}

export function audioFileToPlayerTrack(item: AudioFile, source: AudioPlayerTrack['source'] = 'browse'): AudioPlayerTrack {
    return {
        src: `/audio/key/${item.shareKey}`,
        shareKey: item.shareKey,
        name: item.title || item.name,
        ageLimit: item.ageLimit,
        source,
    };
}

export function playbackToPlayerTrack(track: TrackSummary & {deleted?: boolean}, source: AudioPlayerTrack['source'] = 'home'): AudioPlayerTrack {
    return {
        src: `/audio/key/${track.shareKey}`,
        shareKey: track.shareKey,
        name: track.title || track.filename,
        artist: track.artist || track.parentFolderName || undefined,
        deleted: !!track.deleted,
        ageLimit: track.ageLimit,
        source,
    };
}
