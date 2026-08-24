import {describe, expect, it} from 'vitest';
import {audioShareUrl, parseAudioShareTime} from './share';

describe('audioShareUrl', () => {
    it('builds an absolute canonical URL and encodes the share key', () => {
        expect(audioShareUrl('track/key', 'https://audio.example')).toBe(
            'https://audio.example/share/track%2Fkey',
        );
    });
});

describe('parseAudioShareTime', () => {
    it.each([
        ['90', 90],
        ['90s', 90],
        ['1m30s', 90],
        ['1h2m3s', 3723],
        ['1:30', 90],
        ['1:02:03', 3723],
        [' 2.5m ', 150],
    ])('parses %s as %s seconds', (value, expected) => {
        expect(parseAudioShareTime(value)).toBe(expected);
    });

    it.each([null, '', '-1', '1m30', '1:75', 'later', 'Infinity'])('rejects %s', value => {
        expect(parseAudioShareTime(value)).toBeUndefined();
    });
});
