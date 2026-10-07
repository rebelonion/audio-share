import {readLocalStorage} from './storage';

/**
 * Calendar-driven easter eggs. Each season is a date window checked against the
 * visitor's local clock; the UI asks which seasons are active and decorates
 * itself accordingly. Add a new season here and read it where it should show.
 *
 * Preview any of this out of season from the browser console:
 *   localStorage.setItem('audio-share:season', 'midwinter')  // or 'lunar-new-year', or 'none'
 *   localStorage.setItem('audio-share:late-night', '1')      // or '0'
 *   localStorage.setItem('audio-share:time-of-year', 'autumn') // spring, summer, autumn, or winter
 * Remove the keys to return to the real calendar.
 */
export type SeasonId = 'midwinter' | 'lunar-new-year';

export interface Season {
    id: SeasonId;
    label: string;
    /** Whether the season covers the given local date. */
    active: (date: Date) => boolean;
}

export const SEASON_OVERRIDE_KEY = 'audio-share:season';
export const LATE_NIGHT_OVERRIDE_KEY = 'audio-share:late-night';
export const TIME_OF_YEAR_OVERRIDE_KEY = 'audio-share:time-of-year';

/** The four meteorological seasons, northern hemisphere. */
export type TimeOfYear = 'spring' | 'summer' | 'autumn' | 'winter';
export const TIMES_OF_YEAR: readonly TimeOfYear[] = ['spring', 'summer', 'autumn', 'winter'];

// Lunar New Year's Day by Gregorian year. The festival runs from the eve
// through the Lantern Festival on the fifteenth day. The table has to be
// extended by hand; a test fails two years before it runs out.
export const LUNAR_NEW_YEAR: Record<number, [month: number, day: number]> = {
    2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3],
    2031: [1, 23], 2032: [2, 11], 2033: [1, 31], 2034: [2, 19], 2035: [2, 8],
};

function daysSince(date: Date, month: number, day: number): number {
    const start = new Date(date.getFullYear(), month - 1, day);
    const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // Rounding absorbs the odd-length days around daylight saving changes.
    return Math.round((current.getTime() - start.getTime()) / 86_400_000);
}

export const seasons: readonly Season[] = [
    {
        // The festive stretch from December through Twelfth Night. This is an
        // event window; the calendar season `winter` below runs to the end of February.
        id: 'midwinter',
        label: 'Midwinter',
        active: date => date.getMonth() === 11 || (date.getMonth() === 0 && date.getDate() <= 6),
    },
    {
        id: 'lunar-new-year',
        label: 'Lunar New Year',
        active: date => {
            const newYear = LUNAR_NEW_YEAR[date.getFullYear()];
            if (!newYear) return false;
            const days = daysSince(date, newYear[0], newYear[1]);
            return days >= -1 && days <= 14;
        },
    },
];

export function activeSeasons(date = new Date()): SeasonId[] {
    const override = readLocalStorage(SEASON_OVERRIDE_KEY);
    if (override === 'none') return [];
    if (override) {
        const season = seasons.find(candidate => candidate.id === override);
        if (season) return [season.id];
    }
    return seasons.filter(season => season.active(date)).map(season => season.id);
}

/** The small hours, 1am up to 5am local time. */
export function isLateNight(date = new Date()): boolean {
    const override = readLocalStorage(LATE_NIGHT_OVERRIDE_KEY);
    if (override === '1') return true;
    if (override === '0') return false;
    const hour = date.getHours();
    return hour >= 1 && hour < 5;
}

/** March to May is spring, June to August summer, and so on. */
export function timeOfYear(date = new Date()): TimeOfYear {
    const override = readLocalStorage(TIME_OF_YEAR_OVERRIDE_KEY);
    if (override && (TIMES_OF_YEAR as readonly string[]).includes(override)) return override as TimeOfYear;
    const month = date.getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
}
