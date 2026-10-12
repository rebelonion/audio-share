import {describe, expect, it} from 'vitest';
import {formatDate} from './utils';

describe('formatDate', () => {
    it.each(['', '--', 'not a date', '20260230', '2026-02-30', '2026-13-01'])('omits unknown or invalid date %j', value => {
        expect(formatDate(value)).toBe('');
    });

    it.each(['20240229', '2024-02-29', '2024-02-29T00:00:00Z'])('formats calendar date %j', value => {
        expect(formatDate(value)).toBe(new Date(2024, 1, 29).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
        }));
    });
});
