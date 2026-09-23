/** @vitest-environment jsdom */

import {lazy, useEffect} from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Mountain} from 'lucide-react';
import type {SceneProps} from './scenes/types';
import ImmersivePlayer from './ImmersivePlayer';
import {loadPlayerWaveform} from '@/lib/playerWaveform';
import {useAudioPlayerKeybinds} from '@/hooks/useAudioPlayerKeybinds';

const player = vi.hoisted(() => ({
    currentTrack: {id: 'first', shareKey: 'track-key', name: 'Current recording'},
    metadata: null,
    artist: 'Artist',
    track: 'Track',
    thumbnail: '/artwork.jpg',
    waveformPeaks: Uint8Array.of(10, 100, 20),
    currentTime: 42,
    seekVersion: 0,
    duration: 120,
    isPlaying: true,
    isLoading: false,
    audioLoaded: true,
    error: null,
    notice: null,
    isMuted: false,
    volume: 1,
    upcoming: [{id: 'next', shareKey: 'next-key', name: 'Next recording'}],
    contextLabel: 'Evening playlist',
    autoplay: true,
    toggleAutoplay: vi.fn(),
    removeFromQueue: vi.fn(),
    clearQueue: vi.fn(),
    seekTo: vi.fn(),
    togglePlay: vi.fn(),
}));
const sceneUnmounted = vi.hoisted(() => vi.fn());
const loadPendingScene = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AudioPlayerContext', () => ({useGlobalAudioPlayer: () => player}));
vi.mock('@/lib/playerWaveform', () => ({loadPlayerWaveform: vi.fn()}));
vi.mock('@/lib/errorReporting', () => ({reportError: vi.fn()}));
vi.mock('./scenes/registry', () => {
    function FirstScene({onPreview, onPaletteChange}: SceneProps) {
        useEffect(() => sceneUnmounted, []);
        useEffect(() => {
            onPaletteChange?.({background: '#112233', control: '#223344', hover: '#334455', border: '#445566', accent: '#eebb99'});
        }, [onPaletteChange]);
        return <button onClick={() => onPreview(75)}>Preview first scene</button>;
    }
    function SecondScene(props: SceneProps) {
        const {onPaletteChange} = props;
        useEffect(() => {
            onPaletteChange?.({background: '#331122', control: '#442233', hover: '#553344', border: '#664455', accent: '#ee99bb'});
        }, [onPaletteChange]);
        return <div>
            <output aria-label="Scene inputs">{JSON.stringify(props)}</output>
            <button onClick={() => props.onSeek(80)}>Seek from second scene</button>
        </div>;
    }
    const first = {
        id: 'first', label: 'First', icon: Mountain, Component: FirstScene,
        seekHint: 'Explore first', idleHint: 'First idle',
        waveformCaption: 'First waveform', fallbackCaption: 'First fallback',
    };
    const second = {
        id: 'second', label: 'Second', icon: Mountain, Component: SecondScene,
        seekHint: 'Explore second', idleHint: 'Second idle',
        waveformCaption: 'Second waveform', fallbackCaption: 'Second fallback',
    };
    const unavailable = {
        ...first, id: 'unavailable', label: 'Unavailable',
        Component: lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))),
    };
    const pending = {...second, id: 'pending', label: 'Pending', Component: lazy(loadPendingScene)};
    return {defaultScene: first, scenes: [first, second, unavailable, pending]};
});

let fullscreenElement: Element | null = null;
const requestFullscreen = vi.fn(async () => {
    fullscreenElement = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
});
const exitFullscreen = vi.fn(async () => {
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
});

beforeEach(() => {
    localStorage.clear();
    fullscreenElement = null;
    Object.defineProperties(document, {
        fullscreenEnabled: {configurable: true, value: true},
        fullscreenElement: {configurable: true, get: () => fullscreenElement},
        exitFullscreen: {configurable: true, value: exitFullscreen},
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {configurable: true, value: requestFullscreen});
    vi.stubGlobal('ResizeObserver', class {observe = vi.fn(); disconnect = vi.fn();});
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
        pointerId: number;
        isPrimary: boolean;
        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
            this.isPrimary = init.isPrimary ?? true;
        }
    });
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: () => ({matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()}),
    });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

function KeyboardEnabledPlayer() {
    useAudioPlayerKeybinds({onTogglePlay: player.togglePlay});
    return <ImmersivePlayer onClose={vi.fn()} />;
}

it.each(['Still scene', 'Pause', 'Queue, 1 track upcoming', 'Enter fullscreen', 'Exit immersive player'])(
    'preserves native Space activation on %s without triggering the playback shortcut', name => {
        render(<KeyboardEnabledPlayer />);
        const button = screen.getByRole('button', {name});
        button.focus();
        const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
        fireEvent(button, event);
        expect(event.defaultPrevented).toBe(false);
        expect(player.togglePlay).not.toHaveBeenCalled();
    },
);

it('keeps Space on the scene and K on a focused button available as playback shortcuts', () => {
    render(<KeyboardEnabledPlayer />);
    fireEvent.keyDown(screen.getByRole('dialog', {name: 'Immersive player'}), {key: ' '});
    expect(player.togglePlay).toHaveBeenCalledOnce();
    const button = screen.getByRole('button', {name: 'Still scene'});
    button.focus();
    fireEvent.keyDown(button, {key: 'k'});
    expect(player.togglePlay).toHaveBeenCalledTimes(2);
});

it('passes explicit seek updates to the mounted scene', () => {
    localStorage.setItem('audio-share:immersive-scene', 'second');
    const originalTime = player.currentTime;
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    try {
        player.currentTime = 90;
        player.seekVersion = 1;
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(JSON.parse(screen.getByLabelText('Scene inputs').textContent!))
            .toMatchObject({currentTime: 90, seekVersion: 1});
    } finally {
        player.currentTime = originalTime;
        player.seekVersion = 0;
    }
});

function timeline() {
    const input = screen.getByRole('slider', {name: 'Playback position'}) as HTMLInputElement;
    input.setPointerCapture = vi.fn();
    input.hasPointerCapture = vi.fn(() => true);
    input.releasePointerCapture = vi.fn();
    return input;
}

it('keeps the current scene and playback controls available while another scene loads', async () => {
    let finishLoading!: (module: {default: () => React.ReactNode}) => void;
    loadPendingScene.mockReturnValue(new Promise(resolve => { finishLoading = resolve; }));
    render(<ImmersivePlayer onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Scene'}));
    fireEvent.click(screen.getByRole('option', {name: 'Pending'}));
    expect(screen.getByRole('button', {name: 'Preview first scene'})).toBeTruthy();
    expect(screen.queryByText('Loading scene…')).toBeNull();
    expect(sceneUnmounted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Pause'}));
    expect(player.togglePlay).toHaveBeenCalledOnce();
    await act(async () => finishLoading({default: () => <div>New scene ready</div>}));
    expect(screen.getByText('New scene ready')).toBeTruthy();
    expect(sceneUnmounted).toHaveBeenCalledOnce();
});

it('previews timeline dragging and seeks once on release', () => {
    localStorage.setItem('audio-share:immersive-scene', 'second');
    render(<ImmersivePlayer onClose={vi.fn()} />);
    const input = timeline();
    fireEvent.pointerDown(input, {pointerId: 2, button: 0});
    for (const value of ['55', '70', '85']) fireEvent.change(input, {target: {value}});
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(input.value).toBe('85');
    expect(input.getAttribute('aria-valuetext')).toBe('1:25 of 2:00');
    expect(JSON.parse(screen.getByLabelText('Scene inputs').textContent!)).toMatchObject({currentTime: 42, previewTime: 85});
    expect(input.setPointerCapture).toHaveBeenCalledWith(2);
    fireEvent.pointerUp(input, {pointerId: 3});
    expect(player.seekTo).not.toHaveBeenCalled();
    fireEvent.pointerUp(input, {pointerId: 2});
    fireEvent.lostPointerCapture(input, {pointerId: 2});
    expect(player.seekTo).toHaveBeenCalledExactlyOnceWith(85);
    expect(input.releasePointerCapture).toHaveBeenCalledWith(2);
    expect(JSON.parse(screen.getByLabelText('Scene inputs').textContent!).previewTime).toBeNull();
});

it.each(['pointerCancel', 'lostPointerCapture', 'blur'] as const)('cancels timeline preview on %s without seeking', event => {
    render(<ImmersivePlayer onClose={vi.fn()} />);
    const input = timeline();
    fireEvent.pointerDown(input);
    fireEvent.change(input, {target: {value: '80'}});
    fireEvent[event](input);
    fireEvent.pointerUp(input);
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(input.value).toBe('42');
});

it('discards an in-progress timeline seek when the track changes', () => {
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    const input = timeline();
    fireEvent.pointerDown(input);
    fireEvent.change(input, {target: {value: '80'}});
    const previous = player.currentTrack;
    try {
        player.currentTrack = {...previous, id: 'next'};
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        const nextInput = timeline();
        expect(nextInput).not.toBe(input);
        fireEvent.pointerUp(input);
        fireEvent.pointerUp(nextInput);
        expect(player.seekTo).not.toHaveBeenCalled();
        expect(nextInput.value).toBe('42');
    } finally {
        player.currentTrack = previous;
    }
});

it('keeps keyboard timeline seeking immediate', () => {
    render(<ImmersivePlayer onClose={vi.fn()} />);
    const input = timeline();
    fireEvent.keyDown(input, {key: 'ArrowRight'});
    fireEvent.change(input, {target: {value: '42.1'}});
    expect(player.seekTo).toHaveBeenCalledExactlyOnceWith(42.1);
});

it('preserves the timeline preview through playback updates until release', () => {
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    const input = timeline();
    fireEvent.pointerDown(input);
    fireEvent.change(input, {target: {value: '80'}});
    const previousTime = player.currentTime;
    const previousPlaying = player.isPlaying;
    try {
        player.currentTime = 44;
        player.isPlaying = false;
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(input.value).toBe('80');
        expect(player.seekTo).not.toHaveBeenCalled();
        fireEvent.pointerUp(input);
        expect(player.seekTo).toHaveBeenCalledExactlyOnceWith(80);
    } finally {
        player.currentTime = previousTime;
        player.isPlaying = previousPlaying;
    }
});

it('preserves the landscape preview through pause and resume', () => {
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    const input = screen.getByRole('slider', {name: 'Playback position'}) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', {name: 'Preview first scene'}));
    expect(input.value).toBe('75');
    const previousTime = player.currentTime;
    const previousPlaying = player.isPlaying;
    try {
        for (const isPlaying of [false, true]) {
            player.currentTime = 44;
            player.isPlaying = isPlaying;
            view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
            expect(input.value).toBe('75');
            expect(screen.getByText('Release to seek · 1:15')).toBeTruthy();
            expect(player.seekTo).not.toHaveBeenCalled();
        }
    } finally {
        player.currentTime = previousTime;
        player.isPlaying = previousPlaying;
    }
});

it('keeps the scene menu visible and closes it with Escape before exiting the player', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ImmersivePlayer onClose={onClose} />);
    const picker = screen.getByRole('button', {name: 'Scene'});
    fireEvent.keyDown(picker, {key: 'ArrowDown'});
    expect(document.activeElement).toBe(screen.getByRole('option', {name: 'First'}));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('dialog').classList.contains('immersive-player--quiet')).toBe(false);
    fireEvent.keyDown(document.activeElement!, {key: 'ArrowDown'});
    expect(document.activeElement).toBe(screen.getByRole('option', {name: 'Second'}));
    fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(picker);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(picker, {key: 'Escape'});
    expect(onClose).toHaveBeenCalledOnce();
});

it('keeps playback and controls available after a scene download fails and allows another scene', async () => {
    const parentUnmounted = vi.fn();
    const onClose = vi.fn();
    function PlaybackParent() {
        useEffect(() => parentUnmounted, []);
        return <ImmersivePlayer onClose={onClose} />;
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        render(<PlaybackParent />);
        fireEvent.click(screen.getByRole('button', {name: 'Scene'}));
        fireEvent.click(screen.getByRole('option', {name: 'Unavailable'}));
        expect((await screen.findByRole('alert')).textContent).toContain('Scene could not be loaded');
        expect(parentUnmounted).not.toHaveBeenCalled();
        expect(player.togglePlay).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', {name: 'Pause'}));
        expect(player.togglePlay).toHaveBeenCalledOnce();
        vi.useFakeTimers();
        fireEvent.pointerMove(screen.getByRole('dialog'));
        act(() => vi.advanceTimersByTime(5000));
        expect(screen.getByRole('dialog').classList.contains('immersive-player--quiet')).toBe(false);
        vi.useRealTimers();
        fireEvent.click(screen.getByRole('button', {name: 'Scene'}));
        fireEvent.click(screen.getByRole('option', {name: 'Second'}));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByText('Explore second')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', {name: 'Exit immersive player'}));
        expect(onClose).toHaveBeenCalledOnce();
    } finally {
        consoleError.mockRestore();
    }
});

it.each(['dialog', 'alertdialog'] as const)('defers Tab and Escape to an overlaid %s', type => {
    const onClose = vi.fn();
    const rect = new DOMRect(0, 0, 44, 44);
    const visible = vi.spyOn(HTMLElement.prototype, 'getClientRects')
        .mockReturnValue(Object.assign([rect], {item: () => rect}));
    const overlay = document.createElement('dialog');
    overlay.setAttribute('role', type);
    overlay.setAttribute('aria-modal', 'true');
    const reload = document.createElement('button');
    reload.textContent = 'Reload and verify';
    overlay.append(reload);
    try {
        render(<ImmersivePlayer onClose={onClose} />);
        document.body.append(overlay);
        overlay.open = true;
        reload.focus();
        for (const key of ['Tab', 'Escape']) {
            const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true});
            act(() => reload.dispatchEvent(event));
            expect(event.defaultPrevented).toBe(false);
            expect(document.activeElement).toBe(reload);
        }
        expect(onClose).not.toHaveBeenCalled();
        overlay.remove();
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(onClose).toHaveBeenCalledOnce();
    } finally {
        overlay.remove();
        visible.mockRestore();
    }
});

it('switches scenes, clears scrubbing, and preserves playback and motion preferences', () => {
    render(<ImmersivePlayer onClose={vi.fn()} />);
    const picker = screen.getByRole('button', {name: 'Scene'}).closest<HTMLElement>('.immersive-mode')!;
    expect(picker.style.getPropertyValue('--card')).toBe('#112233');
    fireEvent.click(screen.getByRole('button', {name: 'Preview first scene'}));
    expect(screen.getByRole('slider', {name: 'Playback position'}).getAttribute('aria-valuetext')).toBe('1:15 of 2:00');
    fireEvent.click(screen.getByRole('button', {name: 'Still scene'}));
    fireEvent.click(screen.getByRole('button', {name: 'Scene'}));
    fireEvent.click(screen.getByRole('option', {name: 'Second'}));
    expect(picker.style.getPropertyValue('--card')).toBe('#331122');
    expect(picker.style.getPropertyValue('--primary')).toBe('#ee99bb');

    expect(sceneUnmounted).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', {name: 'Preview first scene'})).toBeNull();
    expect(screen.getByText('Explore second')).toBeTruthy();
    expect(screen.getByText('Second waveform')).toBeTruthy();
    expect(screen.getByRole('slider', {name: 'Playback position'}).getAttribute('aria-valuetext')).toBe('0:42 of 2:00');
    expect(JSON.parse(screen.getByLabelText('Scene inputs').textContent!)).toMatchObject({
        trackKey: 'first', thumbnail: '/artwork.jpg', peaks: {'0': 10, '1': 100, '2': 20},
        currentTime: 42,
    seekVersion: 0, duration: 120, isPlaying: true, motion: false,
        canSeek: true, previewTime: null,
    });
    expect(player.togglePlay).not.toHaveBeenCalled();
    expect(player.seekTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'Seek from second scene'}));
    expect(player.seekTo).toHaveBeenCalledWith(80);
});

it('keeps the selected scene mounted when the track changes', () => {
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Preview first scene'}));
    const previousTrack = player.currentTrack;
    try {
        player.currentTrack = {id: 'next', shareKey: 'next-key', name: 'Next recording'};
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(sceneUnmounted).not.toHaveBeenCalled();
        expect(screen.getByText('Explore first')).toBeTruthy();
        expect(screen.getByRole('slider', {name: 'Playback position'}).getAttribute('aria-valuetext')).toBe('0:42 of 2:00');
    } finally {
        player.currentTrack = previousTrack;
    }
});

it('remembers the selected scene when the immersive player reopens', () => {
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Scene'}));
    fireEvent.click(screen.getByRole('option', {name: 'Second'}));
    expect(localStorage.getItem('audio-share:immersive-scene')).toBe('second');
    view.unmount();

    render(<ImmersivePlayer onClose={vi.fn()} />);
    expect(screen.getByText('Explore second')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Scene'}).textContent).toContain('Second');
    expect(screen.queryByRole('button', {name: 'Preview first scene'})).toBeNull();
});

it('uses the default scene when the saved scene is no longer available', () => {
    localStorage.setItem('audio-share:immersive-scene', 'removed-scene');
    render(<ImmersivePlayer onClose={vi.fn()} />);
    expect(screen.getByText('Explore first')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Scene'}).textContent).toContain('First');
});

it('still allows scene selection when browser storage is unavailable', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {throw new Error('Denied');});
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw new Error('Denied');});
    try {
        render(<ImmersivePlayer onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', {name: 'Scene'}));
        fireEvent.click(screen.getByRole('option', {name: 'Second'}));
        expect(screen.getByText('Explore second')).toBeTruthy();
    } finally {
        read.mockRestore();
        write.mockRestore();
    }
});

it('preloads the next queued waveform near the end of playback', () => {
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    expect(loadPlayerWaveform).not.toHaveBeenCalled();
    try {
        player.currentTime = 105;
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(loadPlayerWaveform).toHaveBeenCalledExactlyOnceWith('next-key');
        player.currentTime = 106;
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(loadPlayerWaveform).toHaveBeenCalledOnce();
    } finally {
        player.currentTime = 42;
    }
});

it('keeps the scene picker keyboard accessible inside the dialog', () => {
    const rect = new DOMRect(0, 0, 44, 44);
    const visible = vi.spyOn(HTMLElement.prototype, 'getClientRects')
        .mockReturnValue(Object.assign([rect], {item: () => rect}));
    try {
        render(<ImmersivePlayer onClose={vi.fn()} />);
        const picker = screen.getByRole('button', {name: 'Scene'});
        picker.focus();
        expect(document.activeElement).toBe(picker);
        const tab = new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true});
        picker.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(picker);
    } finally {
        visible.mockRestore();
    }
});


it('shows the live queue without unmounting the scene and returns focus when dismissed', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ImmersivePlayer onClose={onClose} />);
    const toggle = screen.getByRole('button', {name: 'Queue, 1 track upcoming'});
    fireEvent.click(toggle);
    expect(screen.getByRole('dialog', {name: 'Playback queue'})).toBeTruthy();
    expect(screen.getByText('Current recording')).toBeTruthy();
    expect(screen.getByText('Next recording')).toBeTruthy();
    expect(screen.getAllByText('Evening playlist')).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Close queue'}));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('dialog', {name: 'Immersive player'}).classList.contains('immersive-player--quiet')).toBe(false);
    fireEvent.click(screen.getByRole('button', {name: 'Remove Next recording from queue'}));
    expect(player.removeFromQueue).toHaveBeenCalledWith('next');
    fireEvent.click(screen.getByRole('button', {name: 'Clear'}));
    expect(player.clearQueue).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('switch'));
    expect(player.toggleAutoplay).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    expect(screen.queryByRole('dialog', {name: 'Playback queue'})).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    expect(onClose).not.toHaveBeenCalled();
    expect(sceneUnmounted).not.toHaveBeenCalled();
    expect(player.togglePlay).not.toHaveBeenCalled();
});

it('keeps an open queue in sync as tracks change', () => {
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: /Queue, /}));
    const previousTrack = player.currentTrack;
    const previousUpcoming = player.upcoming;
    try {
        player.currentTrack = previousUpcoming[0];
        player.upcoming = [];
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(screen.queryByText('Current recording')).toBeNull();
        expect(screen.getByText('Next recording')).toBeTruthy();
        expect(screen.getByText('Up next · 0')).toBeTruthy();
        expect(sceneUnmounted).not.toHaveBeenCalled();
        player.upcoming = previousUpcoming;
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(screen.getByRole('button', {name: 'Remove Next recording from queue'})).toBeTruthy();
    } finally {
        player.currentTrack = previousTrack;
        player.upcoming = previousUpcoming;
    }
});

it('toggles fullscreen without restarting the scene and lets Escape exit it first', async () => {
    const onClose = vi.fn();
    render(<ImmersivePlayer onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', {name: 'Enter fullscreen'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Exit fullscreen'}).hasAttribute('disabled')).toBe(false));
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(document.fullscreenElement).toBe(document.documentElement);
    fireEvent.click(screen.getByRole('button', {name: /Queue, /}));
    fireEvent.keyDown(document, {key: 'Escape'});
    await screen.findByRole('button', {name: 'Enter fullscreen'});
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', {name: 'Playback queue'})).toBeTruthy();
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(screen.queryByRole('dialog', {name: 'Playback queue'})).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(sceneUnmounted).not.toHaveBeenCalled();
    expect(player.togglePlay).not.toHaveBeenCalled();
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(onClose).toHaveBeenCalledOnce();
});

it('exits fullscreen on unmount only when this player requested it', async () => {
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Enter fullscreen'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Exit fullscreen'}).hasAttribute('disabled')).toBe(false));
    view.unmount();
    expect(exitFullscreen).toHaveBeenCalledOnce();
    exitFullscreen.mockClear();
    fullscreenElement = document.documentElement;
    const alreadyFullscreen = render(<ImmersivePlayer onClose={vi.fn()} />);
    alreadyFullscreen.unmount();
    expect(exitFullscreen).not.toHaveBeenCalled();
});

it('reflects native fullscreen exits without closing the immersive player', async () => {
    const onClose = vi.fn();
    render(<ImmersivePlayer onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', {name: 'Enter fullscreen'}));
    await screen.findByRole('button', {name: 'Exit fullscreen'});
    act(() => {
        fullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(screen.getByRole('button', {name: 'Enter fullscreen'})).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
});

it('handles fullscreen rejection and hides the toggle where fullscreen is unsupported', async () => {
    requestFullscreen.mockRejectedValueOnce(new Error('Denied'));
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', {name: 'Enter fullscreen'}));
    expect((await screen.findByRole('alert')).textContent).toContain('Fullscreen could not be changed');
    expect(screen.getByRole('button', {name: 'Enter fullscreen'}).hasAttribute('disabled')).toBe(false);
    view.unmount();
    Object.defineProperty(document, 'fullscreenEnabled', {configurable: true, value: false});
    render(<ImmersivePlayer onClose={vi.fn()} />);
    expect(screen.queryByRole('button', {name: 'Enter fullscreen'})).toBeNull();
});

it('keeps the screen awake in Still scene and during buffering, then releases on pause', async () => {
    const lock = Object.assign(new EventTarget(), {released: false, release: vi.fn(async () => {})});
    const request = vi.fn(async () => lock);
    Object.defineProperty(navigator, 'wakeLock', {configurable: true, value: {request}});
    const originalPlaying = player.isPlaying;
    const originalLoading = player.isLoading;
    const view = render(<ImmersivePlayer onClose={vi.fn()} />);
    try {
        await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
        fireEvent.click(screen.getByRole('button', {name: 'Still scene'}));
        player.isLoading = true;
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(lock.release).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledOnce();
        player.isPlaying = false;
        view.rerender(<ImmersivePlayer onClose={vi.fn()} />);
        expect(lock.release).toHaveBeenCalledOnce();
    } finally {
        view.unmount();
        player.isPlaying = originalPlaying;
        player.isLoading = originalLoading;
        Reflect.deleteProperty(navigator, 'wakeLock');
    }
});
