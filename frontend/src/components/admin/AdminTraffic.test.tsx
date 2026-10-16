/** @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import AdminTraffic from './AdminTraffic';
import * as api from '@/lib/adminManagement';
import {AdminAccessError} from '@/lib/operations';

vi.mock('@/lib/adminManagement');
const authFailure = vi.fn();
const count = (bytes: number, requests = 1) => ({bytes, requests});
const report = (range: api.TrafficRange): api.TrafficReport => ({
    generatedAt: '2026-10-16T12:05:00Z',
    trackingSince: '2026-10-01T00:00:00Z',
    windows: (['1h', '24h', '7d', '30d', 'all'] as const).map((window, index) => ({
        window,
        total: count(1_500_000_000 * (index + 1), 10),
        byKind: {stream: count(1_000_000_000 * (index + 1), 8), web: count(500_000_000 * (index + 1), 2)},
    })),
    range,
    rangeTotal: {window: range, total: count(1_500_000_000, 10), byKind: {stream: count(1_000_000_000, 8), web: count(500_000_000, 2)}},
    bucketSeconds: 600,
    points: [{at: '2026-10-16T11:50:00Z', bytes: 600_000_000, byKind: {stream: 600_000_000}}, {at: '2026-10-16T12:00:00Z', bytes: 0, byKind: {}}],
});
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getTraffic).mockImplementation(async range => report(range));
    vi.mocked(api.getTrafficLive).mockResolvedValue({intervalSeconds: 5, activeStreams: 3, activeDownloads: 1, discarded: {bytes: 0, requests: 0}, saving: {lastSavedAt: '2026-10-16T12:00:00Z', failingSince: null, lastError: '', unsaved: {bytes: 0, requests: 0}, pruneError: ''}, samples: [
        {at: '2026-10-16T12:00:00Z', bytes: 10_000_000, seconds: 5}, {at: '2026-10-16T12:00:05Z', bytes: 20_000_000, seconds: 5},
    ]});
});
afterEach(cleanup);

it('shows live throughput, window totals, peaks, and a per-type breakdown; the open interval averages over elapsed time', async () => {
    render(<AdminTraffic onAuthFailure={authFailure} />);
    expect(await screen.findByText('2.9 MB/s')).toBeTruthy();
    expect(screen.getByText('Open streams').previousElementSibling?.textContent).toBe('3');
    expect(await screen.findByText('1.40 GB')).toBeTruthy();
    expect(screen.getByText('All time').previousElementSibling?.textContent).toBe('6.98 GB');
    expect(screen.getByText('Average').nextElementSibling?.textContent).toBe('651.0 KB/s');
    expect(screen.getByText('Peak 10-minute average').nextElementSibling?.textContent).toMatch(/^976.6 KB\/s at /);
    expect(screen.getByText(/· 67% · 8 req/)).toBeTruthy();
    expect(api.getTraffic).toHaveBeenCalledWith('24h', expect.any(AbortSignal));
});

it('loads another range when selected', async () => {
    render(<AdminTraffic onAuthFailure={authFailure} />);
    await screen.findByText('Throughput history');
    fireEvent.click(screen.getByRole('button', {name: '7 days'}));
    await waitFor(() => expect(api.getTraffic).toHaveBeenCalledWith('7d', expect.any(AbortSignal)));
    expect(await screen.findByText('By type, 7 days')).toBeTruthy();
});

it('reports expired sessions', async () => {
    vi.mocked(api.getTrafficLive).mockRejectedValue(new AdminAccessError('expired'));
    render(<AdminTraffic onAuthFailure={authFailure} />);
    await waitFor(() => expect(authFailure).toHaveBeenCalledWith('expired'));
});

it('hides the previous range and its error while another range loads', async () => {
    vi.mocked(api.getTraffic).mockImplementation(range => range === '24h' ? Promise.resolve(report('24h')) : new Promise(() => {}));
    render(<AdminTraffic onAuthFailure={authFailure} />);
    await screen.findByText('Average');
    fireEvent.click(screen.getByRole('button', {name: '7 days'}));
    expect(await screen.findByText('Loading 7 days…')).toBeTruthy();
    expect(screen.queryByText('Average')).toBeNull();
    expect(screen.queryByText('By type, 24 hours')).toBeNull();
});

it('clears a failed range error when switching range', async () => {
    vi.mocked(api.getTraffic).mockImplementation(range => range === '7d' ? Promise.reject(new Error('Range failed')) : Promise.resolve(report(range)));
    render(<AdminTraffic onAuthFailure={authFailure} />);
    await screen.findByText('Average');
    fireEvent.click(screen.getByRole('button', {name: '7 days'}));
    await screen.findByText(/Range failed/);
    expect(screen.getAllByText(/Range failed/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', {name: '30 days'}));
    expect(await screen.findByText('By type, 30 days')).toBeTruthy();
    expect(screen.queryByText(/Range failed/)).toBeNull();
});

it('warns when this instance discarded traffic it could not save', async () => {
    vi.mocked(api.getTrafficLive).mockResolvedValue({intervalSeconds: 5, activeStreams: 0, activeDownloads: 0, discarded: {bytes: 2048, requests: 3}, saving: {lastSavedAt: null, failingSince: null, lastError: '', unsaved: {bytes: 0, requests: 0}, pruneError: ''}, samples: []});
    render(<AdminTraffic onAuthFailure={authFailure} />);
    expect(await screen.findByText(/could not save 2\.0 KB and 3 requests/)).toBeTruthy();
});

it('averages only the time since counting began', async () => {
    vi.mocked(api.getTraffic).mockResolvedValue({...report('24h'), trackingSince: '2026-10-16T11:55:00Z'});
    render(<AdminTraffic onAuthFailure={authFailure} />);
    await screen.findByText('Average');
    expect(screen.getByText('Average').nextElementSibling?.textContent).toBe('976.6 KB/s');
    expect(screen.getByText('Peak 10-minute average').nextElementSibling?.textContent).toMatch(/^1\.9 MB\/s at /);
});

it('shows a failed range instead of loading forever', async () => {
    vi.mocked(api.getTraffic).mockImplementation(range => range === '30d' ? Promise.reject(new Error('Range failed')) : Promise.resolve(report(range)));
    render(<AdminTraffic onAuthFailure={authFailure} />);
    await screen.findByText('Average');
    fireEvent.click(screen.getByRole('button', {name: '30 days'}));
    expect(await screen.findByText('Could not load 30 days: Range failed Retrying every 30 seconds.')).toBeTruthy();
    expect(screen.queryByText('Loading 30 days…')).toBeNull();
});

it('abandons a hung request and retries on the next tick', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    try {
        vi.mocked(api.getTrafficLive).mockReturnValueOnce(new Promise(() => {}));
        render(<AdminTraffic onAuthFailure={authFailure} />);
        expect(api.getTrafficLive).toHaveBeenCalledTimes(1);
        // Started off-cycle by a manual or visibility refresh, it is still
        // abandoned one interval after it began, not up to two.
        await vi.advanceTimersByTimeAsync(5_000);
        expect(api.getTrafficLive).toHaveBeenCalledTimes(2);
        expect(await screen.findByText('2.9 MB/s')).toBeTruthy();
    } finally {
        vi.useRealTimers();
    }
});


it('warns that history is incomplete while saving fails', async () => {
    vi.mocked(api.getTrafficLive).mockResolvedValue({intervalSeconds: 5, activeStreams: 0, activeDownloads: 0, discarded: {bytes: 0, requests: 0},
        saving: {lastSavedAt: '2026-10-16T11:00:00Z', failingSince: '2026-10-16T11:00:10Z', lastError: 'permission denied', unsaved: {bytes: 4096, requests: 7}, pruneError: ''}, samples: []});
    render(<AdminTraffic onAuthFailure={authFailure} />);
    expect(await screen.findByText(/4\.0 KB and 7 requests are waiting/)).toBeTruthy();
    expect(screen.getByText(/Last error: permission denied/)).toBeTruthy();
});
