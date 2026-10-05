import {useEffect, useRef, useState} from 'react';
import {ChevronsDown, ChevronsUp} from 'lucide-react';
import type {PlayerChapter} from '@/lib/playerWaveform';
import {currentChapterIndex} from '@/lib/chapters';
import {formatDuration} from '@/lib/utils';

interface ChapterListProps {
    chapters: PlayerChapter[];
    position: number;
    duration: number;
    canSeek: boolean;
    onSeek: (time: number) => void;
}

const startLabel = (seconds: number) => formatDuration(seconds) || '0:00';

export default function ChapterList({chapters, position, duration, canSeek, onSeek}: ChapterListProps) {
    const [expanded, setExpanded] = useState(false);
    const listRef = useRef<HTMLOListElement>(null);
    const current = currentChapterIndex(chapters, position);

    // Keep the current chapter visible by scrolling only the list, never the page around it.
    useEffect(() => {
        const list = listRef.current;
        const item = list?.children[current] as HTMLElement | undefined;
        if (!expanded || !list || !item) return;
        const top = item.offsetTop - list.offsetTop;
        const bottom = top + item.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }, [current, expanded]);

    if (chapters.length === 0) return null;

    return (
        <div className="mt-3 text-xs text-[var(--muted-foreground)]">
            <button
                type="button"
                onClick={() => setExpanded(value => !value)}
                className="flex w-full items-center justify-between gap-2 rounded px-1 py-1.5 text-left hover:bg-[var(--card-hover-subtle)] hover:text-[var(--foreground)] transition-colors"
                aria-expanded={expanded}
            >
                <span className="min-w-0 flex-1">
                    <span className="font-medium">Chapters</span>
                    <span className="mx-1.5 opacity-60" aria-hidden="true">·</span>
                    <span className="tabular-nums">{chapters.length}</span>
                    {!expanded && current >= 0 && (
                        <span className="mt-0.5 block truncate text-[var(--foreground)]">{chapters[current].title}</span>
                    )}
                </span>
                <span className="p-0.5" aria-hidden="true">
                    {expanded ? <ChevronsUp className="h-3 w-3"/> : <ChevronsDown className="h-3 w-3"/>}
                </span>
            </button>
            {expanded && (
                <ol ref={listRef} className="mt-1 max-h-40 overflow-y-auto rounded bg-[var(--card-hover-subtle)] p-1 custom-scrollbar animate-fadeIn" aria-label="Chapters">
                    {chapters.map((chapter, index) => {
                        const active = index === current;
                        const reachable = !(duration > 0) || chapter.start < duration;
                        return (
                            <li key={`${chapter.start}-${index}`}>
                                <button
                                    type="button"
                                    disabled={!canSeek || !reachable}
                                    title={reachable ? undefined : 'Beyond the end of this recording'}
                                    onClick={() => onSeek(chapter.start)}
                                    aria-current={active ? 'true' : undefined}
                                    className={`flex w-full items-start gap-2 rounded px-1.5 py-1 text-left transition-colors disabled:cursor-default ${active ? 'bg-[var(--primary-soft)] text-[var(--foreground)]' : 'hover:bg-[var(--secondary)] hover:text-[var(--foreground)] disabled:hover:bg-transparent'}`}
                                >
                                    <span className={`shrink-0 tabular-nums ${active ? 'text-[var(--primary-soft-foreground)]' : ''}`}>{startLabel(chapter.start)}</span>
                                    <span className="min-w-0 flex-1 line-clamp-2">{chapter.title}</span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
