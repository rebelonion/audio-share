import {useEffect, useState} from 'react';
import {API_BASE} from '@/lib/api';
import {MATURE_PREFERENCE_EVENT} from '@/lib/matureContentPreference';
import type {PlayerTrack} from '@/lib/playerQueue';
import {appFetch} from '@/lib/cloudflareChallenge';

export interface PlayerMetadata {
    title: string;
    artist: string;
    thumbnail?: boolean;
    uploadDate?: string;
    webpageUrl?: string;
    duration?: number;
    description?: string;
    ageLimit?: number;
    isMature?: boolean;
    showMature?: boolean;
}

interface MetadataState {
    trackID: string | null;
    preferenceVersion: number;
    metadata: PlayerMetadata | null;
    thumbnail: string | null;
    waveformPeaks: Uint8Array | null;
    waveformDuration: number;
}

const EMPTY_METADATA: MetadataState = {
    trackID: null,
    preferenceVersion: 0,
    metadata: null,
    thumbnail: null,
    waveformPeaks: null,
    waveformDuration: 0,
};

export function usePlayerMetadata(track: PlayerTrack | null) {
    const [state, setState] = useState<MetadataState>(EMPTY_METADATA);
    const [preferenceVersion, setPreferenceVersion] = useState(0);

    useEffect(() => {
        const listener = () => setPreferenceVersion(version => version + 1);
        window.addEventListener(MATURE_PREFERENCE_EVENT, listener);
        return () => window.removeEventListener(MATURE_PREFERENCE_EVENT, listener);
    }, []);

    useEffect(() => {
        if (!track) {
            setState({...EMPTY_METADATA, preferenceVersion});
            return;
        }

        const controller = new AbortController();
        const {signal} = controller;
        const key = track.shareKey;
        setState({...EMPTY_METADATA, trackID: track.id, preferenceVersion});

        const waveformRequest = appFetch(`${API_BASE}/api/audio/key/${key}/waveform`, {signal})
            .then(response => response.status === 200 ? response.json() : null)
            .catch(() => null);
        const metadataRequest = appFetch(`${API_BASE}/api/audio/key/${key}/meta`, {
            signal,
            credentials: 'include',
        }).then(response => response.ok ? response.json() : null);

        Promise.all([waveformRequest, metadataRequest])
            .then(([waveform, data]) => {
                if (signal.aborted) return;
                const metadata: PlayerMetadata = data ? {
                    title: data.title || track.name,
                    artist: data.artist || track.artist || '',
                    thumbnail: !!data.thumbnail,
                    uploadDate: data.uploadDate || '',
                    webpageUrl: data.webpageUrl || '',
                    duration: data.duration,
                    description: data.description || '',
                    ageLimit: data.ageLimit,
                    isMature: !!data.isMature,
                    showMature: !!data.showMature,
                } : {
                    title: track.name,
                    artist: track.artist || '',
                };
                const waveformPeaks = waveform?.peaks
                    ? Uint8Array.from(atob(waveform.peaks), value => value.charCodeAt(0))
                    : null;
                const view = metadata.isMature && !metadata.showMature ? 'blurred' : 'original';
                const thumbnail = metadata.thumbnail
                    ? `${API_BASE}/api/audio/key/${key}/thumbnail${metadata.isMature ? `?view=${view}` : ''}`
                    : null;

                setState({
                    trackID: track.id,
                    preferenceVersion,
                    metadata,
                    thumbnail,
                    waveformPeaks,
                    waveformDuration: waveform?.duration || 0,
                });
            })
            .catch(error => {
                if (signal.aborted || error.name === 'AbortError') return;
                setState({
                    trackID: track.id,
                    preferenceVersion,
                    metadata: {title: track.name, artist: track.artist || ''},
                    thumbnail: null,
                    waveformPeaks: null,
                    waveformDuration: 0,
                });
            });

        return () => controller.abort();
    }, [preferenceVersion, track]);

    return state.trackID === track?.id && state.preferenceVersion === preferenceVersion
        ? state
        : {...EMPTY_METADATA, trackID: track?.id || null, preferenceVersion};
}
