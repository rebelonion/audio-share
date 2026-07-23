import {describe, expect, it} from 'vitest';
import type {TrackSummary} from '@/lib/api';
import {playbackToPlayerTrack, trackArtworkUrl, trackArtworkUrls} from './tracks';

type TestTrack = TrackSummary & {
    unavailableAt?: string;
    deleted?: boolean;
};

function playbackTrack(overrides: Partial<TestTrack> = {}): TestTrack {
    return {
        shareKey: 'track-key',
        path: 'audio/folder/track.mp3',
        filename: 'track.mp3',
        title: null,
        artist: null,
        parentPath: 'audio/folder',
        parentFolderName: 'folder',
        parentShareKey: null,
        audioImage: null,
        posterImage: null,
        ...overrides,
    };
}

describe('playback track availability', () => {
    it('keeps audio playable when only its original source is unavailable', () => {
        const track = playbackToPlayerTrack(playbackTrack({unavailableAt: '2026-07-21T00:00:00Z'}));
        expect(track.deleted).toBe(false);
    });

    it('marks audio missing when the indexer has deleted it', () => {
        const track = playbackToPlayerTrack({...playbackTrack(), deleted: true});
        expect(track.deleted).toBe(true);
    });
});

describe('track artwork URLs', () => {
    it('prefers track artwork and falls back to folder artwork', () => {
        expect(trackArtworkUrl(playbackTrack({audioImage: 'thumbnail.jpg'})))
            .toBe('/api/audio/key/track-key/thumbnail');
        expect(trackArtworkUrl(playbackTrack({
            audioImage: null,
            parentShareKey: 'folder-key',
            posterImage: 'poster.jpg',
        }))).toBe('/api/folder/key/folder-key/poster');
    });

    it('returns null without indexed artwork', () => {
        expect(trackArtworkUrl(playbackTrack())).toBeNull();
    });

    it('provides the folder poster as a fallback when a track thumbnail fails', () => {
        expect(trackArtworkUrls(playbackTrack({
            audioImage: 'thumbnail.jpg',
            parentShareKey: 'folder-key',
            posterImage: 'poster.jpg',
        }))).toEqual([
            '/api/audio/key/track-key/thumbnail',
            '/api/folder/key/folder-key/poster',
        ]);
    });
});
