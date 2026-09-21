import {API_BASE} from './api';
import {appFetch} from './cloudflareChallenge';

interface PlayerWaveform {
    peaks?: string;
    duration?: number;
}

const waveforms = new Map<string, Promise<PlayerWaveform | null>>();

// Share pending requests with playback, retaining only the current and nearby tracks.
export function loadPlayerWaveform(key: string): Promise<PlayerWaveform | null> {
    const cached = waveforms.get(key);
    if (cached) return cached;
    const request = appFetch(`${API_BASE}/api/audio/key/${key}/waveform`)
        .then(response => response.status === 200 ? response.json() as Promise<PlayerWaveform> : null)
        .catch(() => null)
        .then(waveform => {
            if (!waveform && waveforms.get(key) === request) waveforms.delete(key);
            return waveform;
        });
    waveforms.set(key, request);
    if (waveforms.size > 3) waveforms.delete(waveforms.keys().next().value!);
    return request;
}
