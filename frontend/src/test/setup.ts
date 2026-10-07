import {vi} from 'vitest';

// Component tests should look the same in December as in June. The calendar
// helpers are pinned here; lib/seasons.test.ts imports the real module.
vi.mock('@/lib/seasons', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/seasons')>(),
    activeSeasons: () => [],
    isLateNight: () => false,
    timeOfYear: () => 'spring',
}));
