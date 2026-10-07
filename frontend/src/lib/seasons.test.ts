/** @vitest-environment jsdom */
import {afterEach, expect, it, vi} from 'vitest';

// The test setup pins these for component tests; here the real calendar is under test.
const {activeSeasons, isLateNight, timeOfYear, LUNAR_NEW_YEAR, LATE_NIGHT_OVERRIDE_KEY, SEASON_OVERRIDE_KEY, TIME_OF_YEAR_OVERRIDE_KEY} = await vi.importActual<typeof import('./seasons')>('./seasons');

afterEach(() => localStorage.clear());

it.each([
    ['2026-11-30T12:00', []],
    ['2026-12-01T00:30', ['midwinter']],
    ['2026-12-25T12:00', ['midwinter']],
    ['2027-01-06T23:30', ['midwinter']],
    ['2027-01-07T00:30', []],
    ['2026-02-15T12:00', []],
    ['2026-02-16T12:00', ['lunar-new-year']],
    ['2026-02-17T12:00', ['lunar-new-year']],
    ['2026-03-03T12:00', ['lunar-new-year']],
    ['2026-03-04T12:00', []],
    ['2028-01-25T12:00', ['lunar-new-year']],
    ['2040-02-01T12:00', []],
])('knows which seasons cover %s', (date, expected) => {
    expect(activeSeasons(new Date(date))).toEqual(expected);
});

it.each([
    ['00:59', false], ['01:00', true], ['03:30', true], ['04:59', true], ['05:00', false], ['23:00', false],
])('treats %s as late night: %s', (time, expected) => {
    expect(isLateNight(new Date(`2026-06-10T${time}`))).toBe(expected);
});

it('lets a stored override preview or silence a season', () => {
    localStorage.setItem(SEASON_OVERRIDE_KEY, 'lunar-new-year');
    expect(activeSeasons(new Date('2026-06-10T12:00'))).toEqual(['lunar-new-year']);
    localStorage.setItem(SEASON_OVERRIDE_KEY, 'none');
    expect(activeSeasons(new Date('2026-12-25T12:00'))).toEqual([]);
    localStorage.setItem(SEASON_OVERRIDE_KEY, 'not-a-season');
    expect(activeSeasons(new Date('2026-12-25T12:00'))).toEqual(['midwinter']);
});

it('lets a stored override force late night on or off', () => {
    localStorage.setItem(LATE_NIGHT_OVERRIDE_KEY, '1');
    expect(isLateNight(new Date('2026-06-10T14:00'))).toBe(true);
    localStorage.setItem(LATE_NIGHT_OVERRIDE_KEY, '0');
    expect(isLateNight(new Date('2026-06-10T03:00'))).toBe(false);
});

it.each([
    ['2026-02-28', 'winter'], ['2026-03-01', 'spring'], ['2026-05-31', 'spring'], ['2026-06-01', 'summer'],
    ['2026-08-31', 'summer'], ['2026-09-01', 'autumn'], ['2026-11-30', 'autumn'], ['2026-12-01', 'winter'],
])('places %s in %s', (date, expected) => {
    expect(timeOfYear(new Date(`${date}T12:00`))).toBe(expected);
});

it('lets a stored override pick the time of year but ignores unknown values', () => {
    localStorage.setItem(TIME_OF_YEAR_OVERRIDE_KEY, 'autumn');
    expect(timeOfYear(new Date('2026-06-10T12:00'))).toBe('autumn');
    localStorage.setItem(TIME_OF_YEAR_OVERRIDE_KEY, 'monsoon');
    expect(timeOfYear(new Date('2026-06-10T12:00'))).toBe('summer');
});

it('has Lunar New Year dates for at least the next two years', () => {
    const years = Object.keys(LUNAR_NEW_YEAR).map(Number);
    const thisYear = new Date().getFullYear();
    for (let year = thisYear; year <= thisYear + 2; year++) expect(years, `add ${year} to LUNAR_NEW_YEAR in lib/seasons.ts`).toContain(year);
    for (const [month, day] of Object.values(LUNAR_NEW_YEAR)) {
        expect([1, 2]).toContain(month);
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(31);
    }
});
