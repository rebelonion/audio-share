import {describe, expect, it} from 'vitest';
import {buildBannerToken, formatBannerPart, parseBannerMessage, parseBannerTimestamp} from './bannerTokens';

const at = Date.UTC(2026, 9, 20, 18, 0);

describe('parseBannerMessage', () => {
    it('splits placeholders from text and keeps invalid ones literal', () => {
        const parts = parseBannerMessage('Live {countdown:2026-10-20T18:00Z|now}! {time:2026-10-20T18:00} {date:2026-10-20T18:00Z|x} {other:1}');
        expect(parts[0]).toEqual({type: 'text', text: 'Live '});
        expect(parts[1]).toMatchObject({type: 'countdown', at, endText: 'now'});
        expect(parts[2]).toEqual({type: 'text', text: '! {time:2026-10-20T18:00} {date:2026-10-20T18:00Z|x} {other:1}'});
    });

    it('accepts the timestamp forms the server accepts', () => {
        expect(parseBannerTimestamp('2026-10-20T13:00-05:00')).toBe(at);
        expect(parseBannerTimestamp(' 2026-10-20t18:00:00.000z ')).toBe(at);
        expect(parseBannerTimestamp('2026-10-20 18:00Z')).toBeNull();
        expect(parseBannerTimestamp('2026-13-20T18:00Z')).toBeNull();
    });
});

describe('formatBannerPart', () => {
    const part = (type: 'countdown' | 'relative' | 'time', endText?: string) => ({type, at, iso: '', source: '', endText});

    it('counts down and then shows the end text', () => {
        expect(formatBannerPart(part('countdown'), at - (2 * 86_400 + 3 * 3600 + 4 * 60 + 5) * 1000)).toBe('2d 3h 04m 05s');
        expect(formatBannerPart(part('countdown'), at - 65_000)).toBe('1m 05s');
        expect(formatBannerPart(part('countdown'), at - 400)).toBe('1s');
        expect(formatBannerPart(part('countdown', 'Live now'), at)).toBe('Live now');
        expect(formatBannerPart(part('countdown'), at + 5000)).toBe('0s');
    });

    it('formats relative and clock times', () => {
        expect(formatBannerPart(part('relative'), at - 3 * 3_600_000, 'en-US')).toBe('in 3 hours');
        expect(formatBannerPart(part('relative'), at + 2 * 86_400_000, 'en-US')).toBe('2 days ago');
        expect(formatBannerPart(part('time'), at, 'en-US')).toMatch(/\d{1,2}:00\s?[AP]M/);
    });
});

it('builds tokens in UTC from a local datetime value', () => {
    const local = '2026-10-20T18:00';
    const iso = new Date(local).toISOString().replace(':00.000Z', 'Z');
    expect(buildBannerToken('countdown', local, ' Live {now} ')).toBe(`{countdown:${iso}|Live now}`);
    expect(buildBannerToken('date', local, 'ignored')).toBe(`{date:${iso}}`);
    expect(buildBannerToken('time', '')).toBeNull();
});
