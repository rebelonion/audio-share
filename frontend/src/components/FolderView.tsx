import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Calendar, Check, Clock, SortAsc} from 'lucide-react';
import {FileSystemItem, Notification} from '@/types';
import AlphaScrollbar from './AlphaScrollbar';
import MobileItemName from "@/components/MobileItemName";
import MobileItemDetails from "@/components/MobileItemDetails";
import TableItem from "@/components/TableItem";
import SearchBar from "@/components/SearchBar";
import MatureContentDialog from "@/components/MatureContentDialog";
import {reverseIf} from "@/lib/utils";
import {useSearchParams} from "react-router";
import {useRybbit} from "@/hooks/useRybbit";
import {recordPlayEvent} from "@/lib/api";
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';

interface FolderViewProps {
    items: FileSystemItem[];
}

type SortMethod = 'alpha' | 'modified' | 'size' | 'duration';

type SearchableItem = {
    item: FileSystemItem;
    searchableText: string;
};

type DisplayEntry =
    | { type: 'letter'; key: string; letter: string }
    | { type: 'item'; key: string; item: FileSystemItem };

const DESKTOP_LETTER_HEIGHT = 33;
const DESKTOP_ITEM_HEIGHT = 65;
const MOBILE_LETTER_HEIGHT = 40; // h-8 + mb-2
const MOBILE_ITEM_HEIGHT = 102; // h-[90px] + mb-3

function getIsDesktop() {
    return typeof window === 'undefined'
        ? true
        : window.matchMedia('(min-width: 768px)').matches;
}

function upperFirstLetter(value: string) {
    return ([...value][0] ?? '').toUpperCase();
}

function lowerBound(values: number[], target: number) {
    let low = 0;
    let high = values.length;

    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (values[middle] < target) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    return low;
}

function useWindowedEntries(entries: DisplayEntry[], isDesktop: boolean) {
    const containerRef = useRef<HTMLDivElement | HTMLTableSectionElement | null>(null);
    const [viewport, setViewport] = useState({top: 0, height: 800});
    const letterHeight = isDesktop ? DESKTOP_LETTER_HEIGHT : MOBILE_LETTER_HEIGHT;
    const itemHeight = isDesktop ? DESKTOP_ITEM_HEIGHT : MOBILE_ITEM_HEIGHT;
    const overscan = isDesktop ? 600 : 800;

    const rowMetrics = useMemo(() => {
        const offsets: number[] = [];
        const letterOffsets: Record<string, number> = {};
        let totalHeight = 0;

        entries.forEach((entry) => {
            const height = entry.type === 'letter' ? letterHeight : itemHeight;

            offsets.push(totalHeight);

            if (entry.type === 'letter') {
                letterOffsets[entry.letter] = totalHeight;
            }

            totalHeight += height;
        });

        return {offsets, letterOffsets, totalHeight};
    }, [entries, itemHeight, letterHeight]);

    useLayoutEffect(() => {
        let frame = 0;

        const updateViewport = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const container = containerRef.current;
                if (!container) return;

                const containerTop = container.getBoundingClientRect().top + window.scrollY;
                setViewport({
                    top: Math.max(0, window.scrollY - containerTop),
                    height: window.innerHeight,
                });
            });
        };

        updateViewport();
        window.addEventListener('scroll', updateViewport, {passive: true});
        window.addEventListener('resize', updateViewport);

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', updateViewport);
            window.removeEventListener('resize', updateViewport);
        };
    }, [entries, isDesktop]);

    const windowedEntries = useMemo(() => {
        if (entries.length === 0) {
            return {
                visibleEntries: [],
                topSpacerHeight: 0,
                bottomSpacerHeight: 0,
            };
        }

        const startTop = Math.max(0, viewport.top - overscan);
        const endTop = viewport.top + viewport.height + overscan;
        const startIndex = Math.max(0, lowerBound(rowMetrics.offsets, startTop) - 1);
        const endIndex = Math.min(entries.length, lowerBound(rowMetrics.offsets, endTop) + 1);
        const topSpacerHeight = rowMetrics.offsets[startIndex] ?? 0;
        const endOffset = endIndex >= entries.length
            ? rowMetrics.totalHeight
            : rowMetrics.offsets[endIndex] ?? rowMetrics.totalHeight;

        return {
            visibleEntries: entries.slice(startIndex, endIndex),
            topSpacerHeight,
            bottomSpacerHeight: Math.max(0, rowMetrics.totalHeight - endOffset),
        };
    }, [entries, overscan, rowMetrics, viewport]);

    const scrollToLetterOffset = useCallback((letter: string) => {
        const container = containerRef.current;
        const offset = rowMetrics.letterOffsets[letter];

        if (!container || offset == null) {
            return;
        }

        window.scrollTo({
            top: container.getBoundingClientRect().top + window.scrollY + offset - 60,
            behavior: 'smooth',
        });
    }, [rowMetrics.letterOffsets]);

    const setContainerRef = useCallback((node: HTMLDivElement | HTMLTableSectionElement | null) => {
        containerRef.current = node;
    }, []);

    return {
        setContainerRef,
        scrollToLetterOffset,
        ...windowedEntries,
    };
}

export default function FolderView({items}: FolderViewProps) {
    const {track} = useRybbit();
    const {selectTrack, setSurface} = useGlobalAudioPlayer();
    const [searchParams] = useSearchParams();
    const [isAudioSelectionLocked, setIsAudioSelectionLocked] = useState(false);
    const [sortMethod, setSortMethod] = useState<SortMethod>('alpha');
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">('asc');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isDesktop, setIsDesktop] = useState(getIsDesktop);
    const [pendingDownload, setPendingDownload] = useState<{ item: FileSystemItem; url: string } | null>(null);
    const [notification, setNotification] = useState<Notification>({
        path: '',
        message: '',
        isError: false,
        visible: false,
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 768px)');
        const updateLayoutMode = () => setIsDesktop(mediaQuery.matches);

        updateLayoutMode();
        mediaQuery.addEventListener('change', updateLayoutMode);

        return () => mediaQuery.removeEventListener('change', updateLayoutMode);
    }, []);

    useEffect(() => {
        const urlSort = searchParams.get("sort") as SortMethod | null;

        if (urlSort && ['alpha', 'modified', 'size', 'duration'].includes(urlSort)) {
            setSortMethod(urlSort);
        } else {
            const folderCount = items.filter(item => item.type === 'folder').length;
            const fileCount = items.filter(item => item.type === 'audio').length;

            if (folderCount >= fileCount) {
                setSortMethod('alpha'); // More folders than files - use alphabetical
            } else {
                setSortMethod('modified'); // More files than folders - use modified date
            }
        }

        const urlOrder = searchParams?.get('order');
        if (urlOrder === 'desc' || urlOrder === 'asc') {
            setSortOrder(urlOrder);
        }
    }, [items, searchParams]);

    const handleOrderToggle = useCallback((method: SortMethod) => {
        if (method === sortMethod) {
            const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            setSortOrder(newOrder);

            const url = new URL(window.location.href);
            url.searchParams.set('order', newOrder);
            window.history.replaceState({}, '', url.toString());
        } else {
            setSortOrder('asc');
            setSortMethod(method);

            const url = new URL(window.location.href);
            url.searchParams.set('sort', method);
            url.searchParams.set('order', 'asc');
            window.history.replaceState({}, '', url.toString());
        }
    }, [setSortOrder, sortMethod, sortOrder]);

    const searchableItems = useMemo<SearchableItem[]>(() => {
        return items.map(item => {
            const parts = [item.name];

            if (item.type === 'folder' && item.metadata) {
                if (item.metadata.name) parts.push(item.metadata.name);
                if (item.metadata.description) parts.push(item.metadata.description);
            }

            return {
                item,
                searchableText: parts.join('\n').toLowerCase(),
            };
        });
    }, [items]);

    const filteredItems = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();

        if (!query) {
            return items;
        }

        return searchableItems
            .filter(({searchableText}) => searchableText.includes(query))
            .map(({item}) => item);
    }, [items, searchableItems, searchQuery]);

    const sortedItems = useMemo(() => {
        switch (sortMethod) {
            case 'alpha': {
                const presortedItems = [...filteredItems].sort((a, b) => {
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;
                    return a.name.localeCompare(b.name);
                });
                return reverseIf(presortedItems, sortOrder === 'desc');
            }
            case 'modified': {
                const presortedItems = [...filteredItems].sort((a, b) => {
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;
                    return b.modifiedAt.localeCompare(a.modifiedAt);
                });
                return reverseIf(presortedItems, sortOrder === 'desc');
            }
            case 'size': {
                const presortedItems = [...filteredItems].sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
                return reverseIf(presortedItems, sortOrder === 'desc');
            }
            case 'duration': {
                return [...filteredItems].sort((a, b) => {
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;

                    const durationA = a.type === 'audio' ? a.durationSeconds ?? 0 : 0;
                    const durationB = b.type === 'audio' ? b.durationSeconds ?? 0 : 0;
                    const durationDiff = sortOrder === 'desc'
                        ? durationB - durationA
                        : durationA - durationB;

                    return durationDiff || a.name.localeCompare(b.name);
                });
            }
            default:
                return reverseIf(filteredItems, sortOrder === 'desc');
        }
    }, [filteredItems, sortMethod, sortOrder]);

    // Group items by first letter (for alphabetical browsing)
    const itemsByLetter = useMemo(() => {
        const grouped: Record<string, FileSystemItem[]> = {};

        sortedItems.forEach(item => {
            const firstLetter = upperFirstLetter(item.name);
            if (!grouped[firstLetter]) {
                grouped[firstLetter] = [];
            }
            grouped[firstLetter].push(item);
        });

        return grouped;
    }, [sortedItems]);

    const sortedLetterGroups = useMemo(() => {
        return Object.entries(itemsByLetter)
            .sort(([a], [b]) => sortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b));
    }, [itemsByLetter, sortOrder]);

    const availableLetters = useMemo(() => {
        return sortedLetterGroups.map(([letter]) => letter);
    }, [sortedLetterGroups]);

    const showAlphaScrollbar = useMemo(() => {
        return sortMethod === 'alpha' && availableLetters.length > 5;
    }, [sortMethod, availableLetters]);

    const displayEntries = useMemo<DisplayEntry[]>(() => {
        if (sortMethod !== 'alpha') {
            return sortedItems.map(item => ({
                type: 'item',
                key: item.path,
                item,
            }));
        }

        return sortedLetterGroups.flatMap(([letter, letterItems]) => [
            {
                type: 'letter' as const,
                key: `letter-${letter}`,
                letter,
            },
            ...letterItems.map(item => ({
                type: 'item' as const,
                key: item.path,
                item,
            })),
        ]);
    }, [sortMethod, sortedItems, sortedLetterGroups]);

    const {
        setContainerRef,
        visibleEntries,
        topSpacerHeight,
        bottomSpacerHeight,
        scrollToLetterOffset,
    } = useWindowedEntries(displayEntries, isDesktop);

    const showDurationColumn = useMemo(() => {
        return items.some(item => item.type === 'audio');
    }, [items]);

    const nameColumnWidth = showDurationColumn ? '45%' : '55%';
    const sizeColumnWidth = showDurationColumn ? '17%' : '20%';

    useEffect(() => {
        if (showDurationColumn || sortMethod !== 'duration') {
            return;
        }

        setSortMethod('alpha');
        setSortOrder('asc');

        const url = new URL(window.location.href);
        url.searchParams.set('sort', 'alpha');
        url.searchParams.set('order', 'asc');
        window.history.replaceState({}, '', url.toString());
    }, [showDurationColumn, sortMethod]);

    useEffect(() => {
        if (notification.visible) {
            const timer = setTimeout(() => {
                setNotification({...notification, visible: false});
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const handleAudioSelect = useCallback((item: FileSystemItem) => {
        if (item.type === 'audio' && !isAudioSelectionLocked) {
            setIsAudioSelectionLocked(true);

            const key = item.shareKey || '';
            if (key) {
                selectTrack({
                    src: `/audio/key/${key}`,
                    shareKey: key,
                    name: item.title || item.name,
                    unavailable: !!item.unavailableAt,
                    source: 'browse',
                    onFirstPlay: () => recordPlayEvent(key).catch(() => {}),
                });
                setSurface('floating');
            }
            track('audio-player-open', { path: item.path, name: item.name });
            setTimeout(() => {
                setIsAudioSelectionLocked(false);
            }, 300);
        }
    }, [isAudioSelectionLocked, selectTrack, setSurface, track]);

    const scrollToLetter = useCallback((letter: string) => {
        scrollToLetterOffset(letter);
    }, [scrollToLetterOffset]);

    const copyToClipboard = useCallback((shareKey: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const url = `${window.location.origin}/share/${shareKey}`;

        try {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(() => {
                    setNotification({
                        path: shareKey,
                        message: 'Share link copied to clipboard!',
                        isError: false,
                        visible: true
                    });
                });
            } else {
                console.error('Clipboard API not available');
                setNotification({
                    path: shareKey,
                    message: 'Copy feature not supported in this browser',
                    isError: true,
                    visible: true
                });
            }
        } catch (err) {
            console.error('Clipboard API failed:', err);
            setNotification({
                path: shareKey,
                message: 'Failed to copy to clipboard',
                isError: true,
                visible: true
            });
        }
    }, []);

    const openDownload = useCallback((url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    const confirmMatureDownload = useCallback(() => {
        if (!pendingDownload) return;

        sessionStorage.setItem('mature-download-warning-ack', 'true');
        setPendingDownload(null);
        track('audio-download', {
            path: pendingDownload.item.path,
            name: pendingDownload.item.name,
        });
        openDownload(pendingDownload.url);
    }, [pendingDownload, track, openDownload]);

    return (
        <div className="relative">
            {createPortal(
                <MatureContentDialog
                    open={!!pendingDownload}
                    title="Mature content"
                    description="This download is marked 18+. Continue download?"
                    confirmLabel="Download"
                    onCancel={() => setPendingDownload(null)}
                    onConfirm={confirmMatureDownload}
                />,
                document.body
            )}

            {/* Floating notification */}
            <div
                className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg transform transition-all duration-300 flex items-center gap-2 ${
                    notification.visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}
                style={notification.isError ? {
                    background: 'var(--error-bg)',
                    border: '1px solid var(--error-border)',
                    color: 'var(--error-text)',
                } : {
                    background: 'var(--primary)',
                    color: '#fff',
                }}
            >
                {notification.isError ? null : (
                    <Check className="h-4 w-4"/>
                )}
                <span>{notification.message || 'Link copied to clipboard!'}</span>
            </div>

            {items.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-foreground)]">
                    <p>This folder is empty</p>
                </div>
            ) : (
                <>
                    <div className="mb-4">
                        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                            <div className="flex-1">
                                <SearchBar value={searchQuery} onChange={setSearchQuery} />
                            </div>

                            {/* Sort Controls */}
                            <div className="flex items-center justify-end md:justify-start space-x-2 flex-shrink-0">
                                <div className="text-[0.7rem] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Sort by:</div>
                                <div className="flex border border-[var(--border)] rounded-md overflow-hidden">
                                    <button
                                        onClick={() => handleOrderToggle('alpha')}
                                        className={`px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.1em] flex items-center ${sortMethod === 'alpha' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'}`}
                                        title="Sort alphabetically"
                                    >
                                        <SortAsc className="h-3.5 w-3.5 mr-1 hidden md:block"/> A-Z
                                    </button>
                                    {showDurationColumn && (
                                        <button
                                            onClick={() => handleOrderToggle('duration')}
                                            className={`px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.1em] flex items-center ${sortMethod === 'duration' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'}`}
                                            title="Sort by playtime"
                                        >
                                            <Clock className="h-3.5 w-3.5 mr-1 hidden md:block"/> Time
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleOrderToggle('modified')}
                                        className={`px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.1em] flex items-center ${sortMethod === 'modified' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'}`}
                                        title="Sort by modified date"
                                    >
                                        <Calendar className="h-3.5 w-3.5 mr-1 hidden md:block"/> Date
                                    </button>
                                    <button
                                        onClick={() => handleOrderToggle('size')}
                                        className={`px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.1em] flex items-center ${sortMethod === 'size' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'}`}
                                        title="Sort by size"
                                    >
                                        <svg className="h-3.5 w-3.5 mr-1 hidden md:block" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                             strokeWidth="2">
                                            <rect x="4" y="14" width="4" height="6" rx="1"/>
                                            <rect x="10" y="9" width="4" height="11" rx="1"/>
                                            <rect x="16" y="4" width="4" height="16" rx="1"/>
                                        </svg>
                                        Size
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {isDesktop ? (
                        <div className="flex items-start gap-2">
                            <div
                                className="flex-1 min-w-0 bg-[var(--card)] rounded-lg shadow-lg border border-[var(--border)] overflow-hidden">
                                <div className="overflow-x-auto scrollbar-hide" id="table-container">
                                    <table className="w-full table-fixed border-collapse">
                                        <thead className="bg-[var(--secondary)] sticky top-0 z-20">
                                        <tr>
                                            <th scope="col"
                                                className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer"
                                                style={{width: nameColumnWidth}}
                                                onClick={() => handleOrderToggle('alpha')}>
                                                Name
                                                {sortMethod === 'alpha' && (sortOrder === 'asc' ? ' ↓' : ' ↑')}
                                            </th>
                                            <th scope="col"
                                                className="px-6 py-3 text-center text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer"
                                                style={{width: sizeColumnWidth}}
                                                onClick={() => handleOrderToggle('size')}>
                                                Size
                                                {sortMethod === 'size' && (sortOrder === 'asc' ? ' ↓' : ' ↑')}
                                            </th>
                                            {showDurationColumn && (
                                                <th scope="col"
                                                    className="px-6 py-3 text-center text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer"
                                                    style={{width: '13%'}}
                                                    onClick={() => handleOrderToggle('duration')}>
                                                    Playtime
                                                    {sortMethod === 'duration' && (sortOrder === 'asc' ? ' ↓' : ' ↑')}
                                                </th>
                                            )}
                                            <th scope="col"
                                                className="px-6 py-3 text-center text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer"
                                                style={{width: '15%'}}
                                                onClick={() => handleOrderToggle('modified')}>
                                                Modified
                                                {sortMethod === 'modified' && (sortOrder === 'asc' ? ' ↓' : ' ↑')}
                                            </th>
                                            <th scope="col"
                                                className="px-6 py-3 text-right text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider"
                                                style={{width: '10%'}}>
                                                Actions
                                            </th>
                                        </tr>
                                        </thead>
                                        <tbody ref={setContainerRef} className="bg-[var(--card)]">
                                        {topSpacerHeight > 0 && (
                                            <tr aria-hidden="true" className="border-0 bg-[var(--card)]">
                                                <td
                                                    colSpan={showDurationColumn ? 5 : 4}
                                                    className="border-0 bg-[var(--card)]"
                                                    style={{height: topSpacerHeight, padding: 0}}
                                                />
                                            </tr>
                                        )}
                                        {visibleEntries.map((entry) => (
                                            entry.type === 'letter' ? (
                                                        <tr
                                                            key={entry.key}
                                                            id={`letter-section-${entry.letter}`}
                                                            data-letter={entry.letter}
                                                            className="h-[33px] bg-[var(--card-hover)] border-t border-[var(--border)] sticky z-10 letter-section"
                                                        >
                                                            <td
                                                                colSpan={showDurationColumn ? 5 : 4}
                                                                className="pl-4 pr-6 py-1.5 border-l-2 border-[var(--primary)]"
                                                                style={{ fontFamily: 'var(--font-display)' }}
                                                            >
                                                                <span className="text-[var(--primary)] font-semibold tracking-widest text-sm">{entry.letter}</span>
                                                            </td>
                                                        </tr>
                                            ) : (
                                                <TableItem item={entry.item}
                                                    showDurationColumn={showDurationColumn}
                                                    handleAudioSelect={handleAudioSelect} notification={notification}
                                                    copyToClipboard={copyToClipboard}
                                                    onMatureDownloadRequest={setPendingDownload}
                                                    key={`desktop-${entry.key}`}/>
                                            )
                                        ))}
                                        {bottomSpacerHeight > 0 && (
                                            <tr aria-hidden="true" className="border-0 bg-[var(--card)]">
                                                <td
                                                    colSpan={showDurationColumn ? 5 : 4}
                                                    className="border-0 bg-[var(--card)]"
                                                    style={{height: bottomSpacerHeight, padding: 0}}
                                                />
                                            </tr>
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {showAlphaScrollbar && (
                                <div className="sticky top-4 self-start">
                                    <AlphaScrollbar letters={availableLetters} onScrollToLetterAction={scrollToLetter}/>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-start gap-1">
                            <div ref={setContainerRef} className="flex-1 min-w-0" id="mobile-content-container">
                            {topSpacerHeight > 0 && <div aria-hidden="true" style={{height: topSpacerHeight}} />}
                            {visibleEntries.map((entry) => (
                                entry.type === 'letter' ? (
                                                <div
                                                    key={entry.key}
                                                    id={`letter-section-mobile-${entry.letter}`}
                                                    data-letter={entry.letter}
                                                    className="h-8 bg-[var(--card-hover)] rounded-sm px-4 py-1.5 mb-2 sticky top-0 z-10 letter-section-mobile border-l-2 border-[var(--primary)]"
                                                    style={{ fontFamily: 'var(--font-display)' }}
                                                >
                                                    <span className="text-[var(--primary)] font-semibold tracking-widest text-sm">{entry.letter}</span>
                                                </div>
                                ) : (
                                                    <div
                                                        key={`mobile-${entry.key}`}
                                                        className={`h-[90px] border border-[var(--border)] rounded-lg mb-3 overflow-hidden ${
                                                            entry.item.type === 'audio' ? 'cursor-pointer' : ''
                                                        } ${entry.item.type === 'audio' && entry.item.unavailableAt ? 'bg-amber-500/5' : 'bg-[var(--card)]'}`}
                                                        title={entry.item.type === 'audio' && entry.item.unavailableAt ? 'The original source of this audio is no longer available.' : undefined}
                                                        onClick={() => entry.item.type === 'audio' && handleAudioSelect(entry.item)}
                                                    >
                                                        <MobileItemName item={entry.item}/>

                                                        <MobileItemDetails item={entry.item} notification={notification}
                                                                  copyToClipboard={copyToClipboard}
                                                                  onMatureDownloadRequest={setPendingDownload}/>
                                                    </div>
                                )
                            ))}
                            {bottomSpacerHeight > 0 && <div aria-hidden="true" style={{height: bottomSpacerHeight}} />}
                            </div>
                            {showAlphaScrollbar && (
                                <div className="sticky top-4 self-start">
                                    <AlphaScrollbar letters={availableLetters} onScrollToLetterAction={scrollToLetter}/>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
