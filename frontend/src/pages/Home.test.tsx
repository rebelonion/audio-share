/** @vitest-environment jsdom */
import {cleanup, render, screen} from '@testing-library/react';
import {HelmetProvider} from 'react-helmet-async';
import {afterEach, expect, it, vi} from 'vitest';
import Home from './Home';

const lateNight = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/hooks/useSeasons', () => ({useLateNight: lateNight, useSeasons: () => [], useTimeOfYear: () => 'spring'}));

vi.mock('@/lib/api', () => ({
    getRecentlyPlayed: vi.fn(async () => []),
    getPopularTracks: vi.fn(async () => []),
    getRecentlyAdded: vi.fn(async () => []),
    getRecentlyUnavailable: vi.fn(async () => []),
}));
vi.mock('@/components/BrowseClient', () => ({default: () => <div>Browse</div>}));
vi.mock('@/components/TrackListSection', () => ({default: () => null}));
vi.mock('@/components/UnavailableBanner', () => ({default: () => null}));

afterEach(() => cleanup());

it.each([[true], [false]])('greets a late-night visitor with "Still up?": %s', async expected => {
    lateNight.mockReturnValue(expected);
    render(<HelmetProvider><Home /></HelmetProvider>);
    await screen.findByText('Browse');
    expect(screen.queryByText('Still up?') !== null).toBe(expected);
});
