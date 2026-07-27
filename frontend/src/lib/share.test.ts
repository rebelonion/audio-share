import {describe, expect, it} from 'vitest';
import {audioShareUrl} from './share';

describe('audioShareUrl', () => {
    it('builds an absolute canonical URL and encodes the share key', () => {
        expect(audioShareUrl('track/key', 'https://audio.example')).toBe(
            'https://audio.example/share/track%2Fkey',
        );
    });
});
