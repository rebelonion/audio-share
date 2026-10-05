/** @vitest-environment jsdom */

import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import MarqueeText from './MarqueeText';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const layout = (textWidth: number, containerWidth: number) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({width: textWidth} as DOMRect);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(containerWidth);
};

it('truncates when the text fits', () => {
    layout(100, 200);
    const {container} = render(<MarqueeText text="Artist • Intro" />);
    expect(container.querySelectorAll('.marquee-copy')).toHaveLength(1);
    expect(container.firstElementChild?.className).toContain('truncate');
});

it('scrolls a duplicated copy when the text overflows', () => {
    layout(300, 200);
    const {container} = render(<MarqueeText text="Artist • A very long chapter title" />);
    const copies = container.querySelectorAll('.marquee-copy');
    expect(copies).toHaveLength(2);
    expect(copies[1].getAttribute('aria-hidden')).toBe('true');
    const track = container.querySelector('.marquee-track') as HTMLElement;
    expect(track.style.getPropertyValue('--marquee-distance')).toBe('332px');
    expect(container.textContent).toContain('Artist • A very long chapter title');
});

it('does not scroll when reduced motion is preferred', () => {
    layout(300, 200);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({matches: true}));
    const {container} = render(<MarqueeText text="Artist • Chapter" />);
    expect(container.querySelectorAll('.marquee-copy')).toHaveLength(1);
});

it('re-measures when web fonts finish loading', async () => {
    const listeners = new Set<() => void>();
    const fonts = {
        addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
        removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
        ready: Promise.resolve(),
    };
    Object.defineProperty(document, 'fonts', {configurable: true, value: fonts});
    layout(100, 200);
    const {container, unmount} = render(<MarqueeText text="Artist • Chapter" />);
    await act(async () => { await fonts.ready; });
    expect(container.querySelectorAll('.marquee-copy')).toHaveLength(1);
    vi.restoreAllMocks();
    layout(300, 200);
    act(() => listeners.forEach(listener => listener()));
    expect(container.querySelectorAll('.marquee-copy')).toHaveLength(2);
    unmount();
    expect(fonts.removeEventListener).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
});
