/** @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
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
