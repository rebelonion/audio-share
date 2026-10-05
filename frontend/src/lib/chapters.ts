import type {PlayerChapter} from '@/lib/playerWaveform';

// Index of the chapter containing `position`, or -1 before the first chapter starts.
export function currentChapterIndex(chapters: PlayerChapter[], position: number): number {
    let index = -1;
    for (let i = 0; i < chapters.length; i++) {
        if (chapters[i].start <= position) index = i;
        else break;
    }
    return index;
}

// Chapter starts worth marking on a seek bar: inside the playable range and not at the very start.
export function chapterTickOffsets(chapters: PlayerChapter[], duration: number): number[] {
    if (!(duration > 0)) return [];
    return chapters
        .map(chapter => chapter.start)
        .filter(start => start > 0 && start < duration)
        .map(start => start / duration * 100);
}
