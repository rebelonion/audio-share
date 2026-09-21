/** @vitest-environment jsdom */

import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import TravelerScene from '../traveler/TravelerScene';
import {DUSK_PALETTE, type TravelerPalette} from '../traveler/traveler';
import NightTrainScene from '../night-train/NightTrainScene';
import {NIGHT_TRAIN_PALETTE, type NightTrainPalette} from '../night-train/palette';

vi.mock('./SceneCanvas', () => ({
    default: ({data}: {data: {palette: TravelerPalette | NightTrainPalette}}) =>
        <output data-testid="rendered-palette">{JSON.stringify(data.palette)}</output>,
}));

const images: {onload: (() => void) | null}[] = [];
let pixels = Uint8ClampedArray.of(200, 50, 50, 255);
const onPaletteChange = vi.fn();
const props = {
    trackKey: 'track', thumbnail: '/red.jpg', peaks: null,
    currentTime: 0, duration: 120, seekVersion: 0, isPlaying: false, isLoading: false, motion: false, canSeek: true,
    previewTime: null, onPreview: vi.fn(), onSeek: vi.fn(), onPaletteChange,
};

beforeEach(() => {
    images.length = 0;
    pixels = Uint8ClampedArray.of(200, 50, 50, 255);
    vi.stubGlobal('Image', class {
        onload: (() => void) | null = null;
        src = '';
        crossOrigin = '';
        constructor() { images.push(this); }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: vi.fn(), getImageData: () => ({data: pixels}),
    } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

it('publishes the colors actually rendered when artwork changes and ignores stale artwork loads', () => {
    const view = render(<TravelerScene {...props} />);
    const staleLoad = images[0].onload!;
    act(() => images[0].onload!());
    const red: TravelerPalette = JSON.parse(screen.getByTestId('rendered-palette').textContent!);
    expect(red).not.toEqual(DUSK_PALETTE);
    expect(onPaletteChange).toHaveBeenLastCalledWith({
        background: red.foreground, control: red.ground, hover: red.middle, border: red.haze, accent: red.horizon,
    });

    view.rerender(<TravelerScene {...props} thumbnail="/blue.jpg" />);
    act(() => staleLoad());
    expect(JSON.parse(screen.getByTestId('rendered-palette').textContent!)).toEqual(DUSK_PALETTE);
    pixels = Uint8ClampedArray.of(50, 50, 200, 255);
    act(() => images[1].onload!());
    const blue: TravelerPalette = JSON.parse(screen.getByTestId('rendered-palette').textContent!);
    expect(blue).not.toEqual(red);
    expect(onPaletteChange).toHaveBeenLastCalledWith({
        background: blue.foreground, control: blue.ground, hover: blue.middle, border: blue.haze, accent: blue.horizon,
    });

    view.rerender(<TravelerScene {...props} thumbnail={null} />);
    expect(onPaletteChange).toHaveBeenLastCalledWith({
        background: DUSK_PALETTE.foreground, control: DUSK_PALETTE.ground, hover: DUSK_PALETTE.middle,
        border: DUSK_PALETTE.haze, accent: DUSK_PALETTE.horizon,
    });
});

it('updates the Night train renderer and picker together from the artwork', () => {
    const view = render(<NightTrainScene {...props} />);
    expect(JSON.parse(screen.getByTestId('rendered-palette').textContent!)).toEqual(NIGHT_TRAIN_PALETTE);
    act(() => images[0].onload!());
    const red: NightTrainPalette = JSON.parse(screen.getByTestId('rendered-palette').textContent!);
    expect(red).not.toEqual(NIGHT_TRAIN_PALETTE);
    expect(onPaletteChange).toHaveBeenLastCalledWith({
        background: red.midnight, control: red.hill, hover: red.forest, border: red.twilight, accent: red.accent,
    });
    view.rerender(<NightTrainScene {...props} thumbnail="/blue.jpg" />);
    pixels = Uint8ClampedArray.of(50, 50, 200, 255);
    act(() => images[1].onload!());
    const blue: NightTrainPalette = JSON.parse(screen.getByTestId('rendered-palette').textContent!);
    expect(blue).not.toEqual(red);
    expect(onPaletteChange).toHaveBeenLastCalledWith({
        background: blue.midnight, control: blue.hill, hover: blue.forest, border: blue.twilight, accent: blue.accent,
    });
});
