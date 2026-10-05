/** @vitest-environment jsdom */

import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import ChapterList from './ChapterList';
import {chapterTickOffsets, currentChapterIndex} from '@/lib/chapters';

const chapters = [
    {title: 'Intro', start: 0, end: 30},
    {title: 'Main part', start: 30, end: 3600},
    {title: 'Outro', start: 3600, end: 3700},
];

afterEach(cleanup);

it('resolves the chapter containing a position', () => {
    expect(currentChapterIndex(chapters, 0)).toBe(0);
    expect(currentChapterIndex(chapters, 29.9)).toBe(0);
    expect(currentChapterIndex(chapters, 30)).toBe(1);
    expect(currentChapterIndex(chapters, 5000)).toBe(2);
    expect(currentChapterIndex([{title: 'Late', start: 10, end: 20}], 5)).toBe(-1);
    expect(currentChapterIndex([], 5)).toBe(-1);
});

it('renders nothing without chapters', () => {
    const {container} = render(<ChapterList chapters={[]} position={0} duration={0} canSeek onSeek={() => {}} />);
    expect(container.innerHTML).toBe('');
});

it('shows the current chapter collapsed and seeks from the expanded list', () => {
    const onSeek = vi.fn();
    render(<ChapterList chapters={chapters} position={45} duration={3700} canSeek onSeek={onSeek} />);
    const toggle = screen.getByRole('button', {name: /Chapters/});
    expect(toggle.textContent).toContain('Main part');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(screen.getByRole('button', {name: /Main part/}).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', {name: /Outro/}).textContent).toContain('1:00:00');

    fireEvent.click(screen.getByRole('button', {name: /Outro/}));
    expect(onSeek).toHaveBeenCalledWith(3600);
});

it('disables chapter buttons until seeking is possible', () => {
    const onSeek = vi.fn();
    render(<ChapterList chapters={chapters} position={0} duration={3700} canSeek={false} onSeek={onSeek} />);
    fireEvent.click(screen.getByRole('button', {name: /Chapters/}));
    const outro = screen.getByRole('button', {name: /Outro/}) as HTMLButtonElement;
    expect(outro.disabled).toBe(true);
    fireEvent.click(outro);
    expect(onSeek).not.toHaveBeenCalled();
});

it('disables chapters that start beyond the playable duration', () => {
    const onSeek = vi.fn();
    render(<ChapterList chapters={chapters} position={0} duration={1800} canSeek onSeek={onSeek} />);
    fireEvent.click(screen.getByRole('button', {name: /Chapters/}));
    expect((screen.getByRole('button', {name: /Main part/}) as HTMLButtonElement).disabled).toBe(false);
    const outro = screen.getByRole('button', {name: /Outro/}) as HTMLButtonElement;
    expect(outro.disabled).toBe(true);
    fireEvent.click(outro);
    expect(onSeek).not.toHaveBeenCalled();
});

it('places tick marks only for in-range chapter starts', () => {
    expect(chapterTickOffsets(chapters, 3700)).toEqual([30 / 3700 * 100, 3600 / 3700 * 100]);
    expect(chapterTickOffsets(chapters, 1800)).toEqual([30 / 1800 * 100]);
    expect(chapterTickOffsets([{title: 'Late start', start: 10, end: 20}, {title: 'Next', start: 20, end: 30}], 100)).toEqual([10, 20]);
    expect(chapterTickOffsets(chapters, 0)).toEqual([]);
    expect(chapterTickOffsets(chapters.slice(0, 1), 100)).toEqual([]);
    expect(chapterTickOffsets([{title: 'Only, late', start: 10, end: 90}], 100)).toEqual([10]);
});
