import {useEffect, useState} from 'react';
import {API_BASE} from '@/lib/api';
import {MATURE_PREFERENCE_EVENT} from '@/lib/matureContentPreference';
import type {PlayerTrack} from '@/lib/playerQueue';
import {appFetch} from '@/lib/cloudflareChallenge';
import {reportError} from '@/lib/errorReporting';
import {loadPlayerWaveform} from '@/lib/playerWaveform';

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

        const waveformRequest = loadPlayerWaveform(key);
        const metadataRequest = appFetch(`${API_BASE}/api/audio/key/${key}/meta`, {
            signal,
            credentials: 'include',
        }).then(response => response.ok ? response.json() : null);

        waveformRequest.then(waveform => {
            if (signal.aborted) return;
            const waveformPeaks = waveform?.peaks
                ? Uint8Array.from(atob(waveform.peaks), value => value.charCodeAt(0))
                : null;
            setState(previous => ({...previous, waveformPeaks, waveformDuration: waveform?.duration || 0}));
        }).catch(error => {
            if (signal.aborted) return;
            reportError({operation: 'metadata', stage: 'parse', cause: 'invalid-response', outcome: 'degraded', context: {resource: track.shareKey}}, error);
        });

        metadataRequest
            .then(data => {
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
                const view = metadata.isMature && !metadata.showMature ? 'blurred' : 'original';
                const thumbnail = metadata.thumbnail
                    ? `${API_BASE}/api/audio/key/${key}/thumbnail${metadata.isMature ? `?view=${view}` : ''}`
                    : null;

                setState(previous => ({
                    ...previous,
                    metadata,
                    thumbnail,
                }));
            })
            .catch(error => {
                if (signal.aborted || error.name === 'AbortError') return;
                reportError({operation: 'metadata', stage: 'parse', cause: 'invalid-response', outcome: 'degraded', context: {resource: track.shareKey}}, error);
                setState(previous => ({
                    ...previous,
                    metadata: {title: track.name, artist: track.artist || ''},
                    thumbnail: null,
                }));
            });

        return () => controller.abort();
    }, [preferenceVersion, track]);

    return state.trackID === track?.id && state.preferenceVersion === preferenceVersion
        ? state
        : {...EMPTY_METADATA, trackID: track?.id || null, preferenceVersion};
}
