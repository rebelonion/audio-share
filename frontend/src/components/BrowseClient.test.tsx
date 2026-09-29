/** @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {afterEach, expect, it, vi} from 'vitest';
import {fetchDirectoryContents} from '@/lib/api';
import BrowseClient from './BrowseClient';

vi.mock('@/lib/api', () => ({fetchDirectoryContents: vi.fn()}));
vi.mock('@/lib/browseState', () => ({getCachedDirectory: () => undefined, cacheDirectory: vi.fn()}));
vi.mock('./FolderView', () => ({default: () => <div>Directory contents</div>}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('retries a failed directory without a full-page reload', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const fetch = vi.mocked(fetchDirectoryContents)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({items: [], currentPath: ''});
    render(<MemoryRouter><BrowseClient /></MemoryRouter>);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
    await screen.findByText('Directory contents');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
});
