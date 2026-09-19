/** @vitest-environment jsdom */

import {Component, type ReactNode} from 'react';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {HelmetProvider} from 'react-helmet-async';
import {MemoryRouter, useNavigate} from 'react-router';
import {afterEach, expect, it, vi} from 'vitest';
import Search from './Search';

const mocks = vi.hoisted(() => ({track: vi.fn(), playTrack: vi.fn(), total: 2}));

vi.mock('@/hooks/useRybbit', () => ({useRybbit: () => ({track: mocks.track})}));
vi.mock('@/hooks/useMatureContentPreference', () => ({
    useMatureContentPreference: () => ({enabled: false, isLoading: false}),
}));
vi.mock('@/contexts/AudioPlayerContext', () => ({
    useAudioPlayerCommands: () => ({playTrack: mocks.playTrack}),
}));
vi.mock('@/components/RequestSourceDialog', () => ({default: () => null}));
vi.mock('@/components/TrackQuickActions', () => ({default: () => null}));
vi.mock('@/lib/api', () => ({
    searchAudio: vi.fn(async () => ({
        results: Array.from({length: mocks.total}, (_, id) => ({
            id, type: 'folder', name: `Folder ${id}`, path: `folder-${id}`,
        })),
        total: mocks.total,
    })),
    fetchDirectoryContents: vi.fn(async () => ({items: []})),
    isMatureAge: () => false,
}));

class CaptureError extends Component<{children: ReactNode}, {error: Error | null}> {
    state = {error: null as Error | null};

    static getDerivedStateFromError(error: Error) {
        return {error};
    }

    render() {
        return this.state.error
            ? <div role="alert">{this.state.error.name}: {this.state.error.message}</div>
            : this.props.children;
    }
}

function SearchHarness() {
    const navigate = useNavigate();
    return <>
        <button onClick={() => navigate('/search?q=second')}>Change search</button>
        <CaptureError><Search /></CaptureError>
    </>;
}

afterEach(() => {
    cleanup();
    mocks.total = 2;
    vi.restoreAllMocks();
});

it.each([false, true])('changes from two results to one with translated text: %s', async (translated) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<HelmetProvider>
        <MemoryRouter initialEntries={['/search?q=first']}>
            <SearchHarness />
        </MemoryRouter>
    </HelmetProvider>);

    const summary = await screen.findByText('Found 2 results for "first"');
    if (translated) {
        // Reproduce a translator replacing React-owned text nodes with elements.
        for (const node of Array.from(summary.childNodes)) {
            if (node.nodeType !== Node.TEXT_NODE) continue;
            const replacement = document.createElement('font');
            replacement.textContent = node.textContent;
            summary.replaceChild(replacement, node);
        }
    }

    mocks.total = 1;
    fireEvent.click(screen.getByRole('button', {name: 'Change search'}));

    await waitFor(() => expect(screen.getByText('Found 1 result for "second"')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(errors).not.toHaveBeenCalled();
});
