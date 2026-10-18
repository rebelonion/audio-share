/** @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';

vi.mock('@/hooks/useRybbit', () => ({useRybbit: () => ({track: vi.fn()})}));

async function mount(banner: NonNullable<Window['__BANNER__']>) {
    window.__BANNER__ = banner;
    vi.resetModules();
    const {default: InfoBanner} = await import('./InfoBanner');
    return render(<MemoryRouter><InfoBanner /></MemoryRouter>);
}
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); delete window.__BANNER__; });

it('shows a dismissed banner again when its style or link text changes', async () => {
    const banner = {message: 'Requests paused', variant: 'info', linkText: 'Details', linkUrl: '/requests'};
    await mount(banner);
    fireEvent.click(screen.getByRole('button', {name: 'Dismiss notice'}));
    expect(screen.queryByText('Requests paused')).toBeNull();
    cleanup();

    await mount(banner);
    expect(screen.queryByText('Requests paused')).toBeNull();
    cleanup();

    await mount({...banner, variant: 'warning'});
    expect(screen.getByText('Requests paused')).toBeTruthy();
    cleanup();

    await mount({...banner, linkText: 'Read more'});
    expect(screen.getByText('Requests paused')).toBeTruthy();
});

it('fills in time placeholders and ticks countdowns', async () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'Date']});
    vi.setSystemTime(Date.UTC(2026, 9, 20, 17, 59, 58));
    try {
        await mount({message: 'Live in {countdown:2026-10-20T18:00Z|now} {nope:1}', variant: 'info'});
        const region = screen.getByRole('region', {name: 'Site notice'});
        expect(region.textContent).toContain('Live in 2s {nope:1}');
        expect(region.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-20T18:00Z');
        await act(() => vi.advanceTimersByTime(2000));
        expect(region.textContent).toContain('Live in now');
    } finally {
        vi.useRealTimers();
    }
});
