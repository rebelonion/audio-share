/** @vitest-environment jsdom */
import {useEffect} from 'react';
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import PageLoadBoundary from './PageLoadBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps the player mounted when a route fails and permits another route', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unmounted = vi.fn();
    function Player() {
        useEffect(() => unmounted, []);
        return <div>Playing audio</div>;
    }
    function Page({fail}: {fail: boolean}) {
        if (fail) throw new Error('Failed to fetch dynamically imported module');
        return <div>Page loaded</div>;
    }
    const view = (fail: boolean, path: string) => <>
        <Player />
        <PageLoadBoundary key={path}><Page fail={fail} /></PageLoadBoundary>
    </>;
    const {rerender} = render(view(false, '/'));
    rerender(view(true, '/missing'));
    expect(screen.getByRole('alert').textContent).toContain('keep listening');
    expect(screen.getByRole('button', {name: 'Refresh page'})).toBeDefined();
    expect(screen.getByText('Playing audio')).toBeDefined();
    expect(unmounted).not.toHaveBeenCalled();
    rerender(view(false, '/another'));
    expect(screen.getByText('Page loaded')).toBeDefined();
    expect(unmounted).not.toHaveBeenCalled();
});
