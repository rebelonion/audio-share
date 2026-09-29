/** @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {HelmetProvider} from 'react-helmet-async';
import {afterEach, expect, it, vi} from 'vitest';
import {appFetch} from '@/lib/cloudflareChallenge';
import Stats from './Stats';

vi.mock('@/lib/cloudflareChallenge', () => ({appFetch: vi.fn()}));
vi.mock('@/components/StatsCharts', () => ({
    AudioChart: () => null, UnavailableChart: () => null, SourcesChart: () => null,
    DurationChart: () => null, PublicationYearChart: () => null, SourceAvailabilityChart: () => null,
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(['http', 'network'])('shows a retryable error for a %s failure instead of an empty chart', async failure => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = vi.mocked(appFetch).mockReset();
    if (failure === 'http') fetch.mockResolvedValueOnce(new Response('', {status: 503}));
    else fetch.mockRejectedValueOnce(new Error('offline'));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({audio: null, sources: null})));
    render(<HelmetProvider><Stats /></HelmetProvider>);
    await screen.findByRole('alert');
    expect(screen.queryByText('No audio data available.')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
    await screen.findByRole('region', {name: 'Audio Files by Day'});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('No audio data available.')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
});
