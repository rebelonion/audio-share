'use client';

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Calendar, Check, Music, SortAsc} from 'lucide-react';
import {FileSystemItem, Notification} from '@/types';
import AudioPlayer from './AudioPlayer';
import AlphaScrollbar from './AlphaScrollbar';
import MobileItemName from "@/components/MobileItemName";
import ItemSize from "@/components/ItemSize";
import TableItem from "@/components/TableItem";

interface FolderViewProps {
    items: FileSystemItem[];
    currentPath: string;
}

type SortMethod = 'alpha' | 'modified' | 'size' | 'type';

export default function FolderView({items}: FolderViewProps) {
    const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
    const [selectedAudioName, setSelectedAudioName] = useState<string>('');
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [isAudioSelectionLocked, setIsAudioSelectionLocked] = useState(false);
    const [sortMethod, setSortMethod] = useState<SortMethod>('alpha');
    const [notification, setNotification] = useState<Notification>({
        path: '',
        message: '',
        isError: false,
        visible: false
    });

    const letterRefs = useRef<Record<string, HTMLElement | null>>({});

    useEffect(() => {
        const folderCount = items.filter(item => item.type === 'folder').length;
        const fileCount = items.filter(item => item.type === 'audio').length;

        if (folderCount >= fileCount) {
            setSortMethod('alpha'); // More folders than files - use alphabetical
        } else {
            setSortMethod('modified'); // More files than folders - use modified date
        }
    }, [items]);

    const sortedItems = useMemo(() => {
        switch (sortMethod) {
            case 'alpha':
                return [...items].sort((a, b) => {
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;
                    return a.name.localeCompare(b.name);
                });

            case 'modified':
                return [...items].sort((a, b) => {
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;
                    return b.modifiedAt.localeCompare(a.modifiedAt);
                });

            case 'size':
                return [...items].sort((a, b) => {
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;
                    const aSize = 'size' in a ? a.size : 0;
                    const bSize = 'size' in b ? b.size : 0;
                    return bSize - aSize;
                });

            case 'type':
                return [...items].sort((a, b) => {
                    // First by type
                    if (a.type === 'folder' && b.type !== 'folder') return -1;
                    if (a.type !== 'folder' && b.type === 'folder') return 1;

                    // Then by extension for audio files
                    if (a.type === 'audio' && b.type === 'audio') {
                        const aExt = a.name.split('.').pop() || '';
                        const bExt = b.name.split('.').pop() || '';
                        const extCompare = aExt.localeCompare(bExt);

                        // If same extension, sort by name
                        if (extCompare === 0) {
                            return a.name.localeCompare(b.name);
                        }
                        return extCompare;
                    }

                    // Default to name comparison
                    return a.name.localeCompare(b.name);
                });

            default:
                return items;
        }
    }, [items, sortMethod]);

    // Group items by first letter (for alphabetical browsing)
    const itemsByLetter = useMemo(() => {
        const grouped: Record<string, FileSystemItem[]> = {};

        sortedItems.forEach(item => {
            const firstLetter = item.name.charAt(0).toUpperCase();
            if (!grouped[firstLetter]) {
                grouped[firstLetter] = [];
            }
            grouped[firstLetter].push(item);
        });

        return grouped;
    }, [sortedItems]);

    const showAlphaScrollbar = useMemo(() => {
        return sortMethod === 'alpha' && Object.keys(itemsByLetter).length > 5;
    }, [sortMethod, itemsByLetter]);

    useEffect(() => {
        if (notification.visible) {
            const timer = setTimeout(() => {
                setNotification({...notification, visible: false});
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const handleAudioSelect = (item: FileSystemItem) => {
        if (item.type === 'audio' && !isAudioSelectionLocked) {
            setIsAudioSelectionLocked(true);

            const path = item.path.split('/').map(encodeURIComponent).join('/');
            const audioPath = (item.path.startsWith('audio/') ? `/${path}` : `/audio/${path}`);
            console.log('Setting audio path:', audioPath);
            setSelectedAudio(audioPath);
            setSelectedAudioName(item.name);
            setTimeout(() => {
                setIsAudioSelectionLocked(false);
            }, 300);
        }
    };

    const letterPositionCache: {[key: string]: number} = {};

    const scrollToLetter = (letter: string) => {
        const isMobile = window.innerWidth < 768;
        
        if (isMobile) {
            if (letterPositionCache[letter] !== undefined) {
                const mobileContainer = document.getElementById('mobile-content-container');
                if (mobileContainer) {
                    mobileContainer.scrollTop = letterPositionCache[letter];
                    return;
                }
            }

            const letterSelector = `.letter-section-mobile[data-letter="${letter}"]`;
            const targetElement = document.querySelector(letterSelector);
            const mobileContainer = document.getElementById('mobile-content-container');
            
            if (targetElement && mobileContainer) {
                if (Object.keys(letterPositionCache).length === 0) {
                    mobileContainer.scrollTop = 0;
                    
                    setTimeout(() => {
                        const allLetters = document.querySelectorAll('.letter-section-mobile');
                        allLetters.forEach(letterElement => {
                            const letterValue = letterElement.getAttribute('data-letter');
                            if (letterValue && letterElement instanceof HTMLElement) {
                                letterPositionCache[letterValue] = letterElement.offsetTop;
                            }
                        });

                        if (letterPositionCache[letter] !== undefined) {
                            mobileContainer.scrollTop = letterPositionCache[letter];
                        } else {
                            targetElement.scrollIntoView({block: 'start', behavior: 'auto'});
                        }
                    }, 50);
                } else {
                    targetElement.scrollIntoView({block: 'start', behavior: 'auto'});
                }
            }
        } else {
            // Desktop
            const targetId = `letter-section-${letter}`;
            const element = document.getElementById(targetId);
            const tableContainer = document.getElementById('table-container');
            
            if (element && tableContainer) {
                setTimeout(() => {
                    tableContainer.scrollTop = element.offsetTop - 60;
                }, 10);
            }
        }
    };

    const copyToClipboard = (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const pathParts = path.split('/');
        const source = encodeURIComponent(pathParts[0]);
        const filePath = pathParts.slice(1).map(segment => encodeURIComponent(segment)).join('/');
        const url = `${window.location.origin}/share/${source}/${filePath}`;

        try {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(() => {
                    setNotification({
                        path: path,
                        message: 'Share link copied to clipboard!',
                        isError: false,
                        visible: true
                    });
                });
            } else {
                console.error('Clipboard API not available');
                setNotification({
                    path: path,
                    message: 'Copy feature not supported in this browser',
                    isError: true,
                    visible: true
                });
            }
        } catch (err) {
            console.error('Clipboard API failed:', err);
            setNotification({
                path: path,
                message: 'Failed to copy to clipboard',
                isError: true,
                visible: true
            });
        }
    };

    return (
        <div className="relative">
            {/* Floating notification */}
            <div
                className={`fixed bottom-4 right-4 ${notification.isError ? 'bg-red-600' : 'bg-green-600'} text-white px-4 py-2 rounded-md shadow-lg transform transition-transform duration-300 flex items-center gap-2 ${
                    notification.visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}
            >
                {notification.isError ? (
                    <span className="h-4 w-4">⚠️</span>
                ) : (
                    <Check className="h-4 w-4"/>
                )}
                <span>{notification.message || 'Link copied to clipboard!'}</span>
            </div>

            {selectedAudio && (
                <AudioPlayer src={selectedAudio} name={selectedAudioName}/>
            )}

            {items.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-foreground)]">
                    <p>This folder is empty</p>
                </div>
            ) : (
                <>
                    {/* Sort Controls */}
                    <div className="mb-4 flex items-center justify-end space-x-2">
                        <div className="text-sm text-[var(--muted-foreground)]">Sort by:</div>
                        <div className="flex border border-[var(--border)] rounded-md overflow-hidden">
                            <button
                                onClick={() => setSortMethod('alpha')}
                                className={`px-3 py-1.5 text-sm flex items-center ${sortMethod === 'alpha' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'}`}
                                title="Sort alphabetically"
                            >
                                <SortAsc className="h-3.5 w-3.5 mr-1"/> A-Z
                            </button>
                            <button
                                onClick={() => setSortMethod('modified')}
                                className={`px-3 py-1.5 text-sm flex items-center ${sortMethod === 'modified' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'}`}
                                title="Sort by modified date"
                            >
                                <Calendar className="h-3.5 w-3.5 mr-1"/> Date
                            </button>
                            <button
                                onClick={() => setSortMethod('size')}
                                className={`px-3 py-1.5 text-sm flex items-center ${sortMethod === 'size' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'}`}
                                title="Sort by size"
                            >
                                <svg className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth="2">
                                    <rect x="4" y="14" width="4" height="6" rx="1"/>
                                    <rect x="10" y="9" width="4" height="11" rx="1"/>
                                    <rect x="16" y="4" width="4" height="16" rx="1"/>
                                </svg>
                                Size
                            </button>
                            <button
                                onClick={() => setSortMethod('type')}
                                className={`px-3 py-1.5 text-sm flex items-center ${sortMethod === 'type' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'}`}
                                title="Group by type"
                            >
                                <Music className="h-3.5 w-3.5 mr-1"/> Type
                            </button>
                        </div>
                    </div>

                    {/* Desktop view */}
                    <div className="hidden md:block relative">
                        {showAlphaScrollbar && <AlphaScrollbar items={sortedItems} onScrollToLetterAction={scrollToLetter}/>}
                        
                        <div className="bg-[var(--card)] rounded-lg shadow-lg border border-[var(--border)] overflow-hidden">
                            <div className="overflow-x-auto overflow-y-auto max-h-[70vh] scroll-smooth" id="table-container"
                                 style={{WebkitOverflowScrolling: 'touch'}}>
                                <table className="w-full table-fixed divide-y divide-[var(--border)]">
                                <thead className="bg-[var(--card-hover)] sticky top-0 z-10">
                                <tr>
                                    <th scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer"
                                        style={{width: '55%'}}
                                        onClick={() => setSortMethod('alpha')}>
                                        Name
                                        {sortMethod === 'alpha' && ' ↓'}
                                    </th>
                                    <th scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer"
                                        style={{width: '20%'}}
                                        onClick={() => setSortMethod('size')}>
                                        Size
                                        {sortMethod === 'size' && ' ↓'}
                                    </th>
                                    <th scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer"
                                        style={{width: '15%'}}
                                        onClick={() => setSortMethod('modified')}>
                                        Modified
                                        {sortMethod === 'modified' && ' ↓'}
                                    </th>
                                    <th scope="col"
                                        className="px-6 py-3 text-right text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider"
                                        style={{width: '10%'}}>
                                        Actions
                                    </th>
                                </tr>
                                </thead>
                                <tbody className="bg-[var(--card)] divide-y divide-[var(--border)]">
                                {sortMethod === 'alpha' ? (
                                    Object.entries(itemsByLetter)
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([letter, letterItems]) => (
                                            <React.Fragment key={`letter-group-${letter}`}>
                                                <tr
                                                    id={`letter-section-${letter}`}
                                                    data-letter={letter}
                                                    ref={(el) => {
                                                        if (el) letterRefs.current[letter] = el;
                                                    }}
                                                    className="bg-[var(--card-hover)] sticky z-[5] letter-section"
                                                >
                                                    <td
                                                        colSpan={4}
                                                        className="px-6 py-2 font-semibold text-[var(--primary)]"
                                                    >
                                                        {letter}
                                                    </td>
                                                </tr>

                                                {/* Items starting with this letter */}
                                                {letterItems.map((item) => (
                                                    <TableItem item={item} isLoading={isLoading} setIsLoading={setIsLoading}
                                                               handleAudioSelect={handleAudioSelect} notification={notification}
                                                               copyToClipboard={copyToClipboard} key={`desktop-${item.path}`}/>
                                                ))}
                                            </React.Fragment>
                                        ))
                                ) : (
                                    // Non-alphabetical view - flat list
                                    sortedItems.map((item) => (
                                        <TableItem item={item} isLoading={isLoading} setIsLoading={setIsLoading}
                                                   handleAudioSelect={handleAudioSelect} notification={notification}
                                                   copyToClipboard={copyToClipboard} key={`desktop-flat-${item.path}`}/>
                                    ))
                                )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                    {/* Mobile view */}
                    <div className="md:hidden relative flex">
                        {showAlphaScrollbar && <AlphaScrollbar items={sortedItems} onScrollToLetterAction={scrollToLetter}/>}

                        <div className="flex-grow overflow-y-auto max-h-[70vh] pb-4 scroll-smooth" id="mobile-content-container">
                            {sortMethod === 'alpha' ? (
                                Object.entries(itemsByLetter)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([letter, letterItems]) => (
                                        <React.Fragment key={`letter-group-mobile-${letter}`}>
                                            <div
                                                id={`letter-section-mobile-${letter}`}
                                                data-letter={letter}
                                                ref={(el) => {
                                                    if (el) letterRefs.current[letter] = el;
                                                }}
                                                className="bg-[var(--card-hover)] rounded-lg px-4 py-2 mb-2 font-semibold text-[var(--primary)] sticky top-0 z-10 letter-section-mobile"
                                            >
                                                {letter}
                                            </div>

                                            {/* Items starting with this letter */}
                                            {letterItems.map((item) => (
                                                <div
                                                    key={`mobile-${item.path}`}
                                                    className={`border border-[var(--border)] rounded-lg mb-3 bg-[var(--card)] overflow-hidden ${
                                                        item.type === 'audio' ? 'cursor-pointer' : ''
                                                    }`}
                                                    onClick={() => item.type === 'audio' && handleAudioSelect(item)}
                                                >
                                                    <MobileItemName item={item} isLoading={isLoading}
                                                                    setIsLoading={setIsLoading}/>

                                                    <ItemSize item={item} notification={notification}
                                                              copyToClipboard={copyToClipboard}/>
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    ))
                            ) : (
                                // Non-alphabetical view - flat list
                                sortedItems.map((item) => (
                                    <div
                                        key={`mobile-flat-${item.path}`}
                                        className={`border border-[var(--border)] rounded-lg mb-3 bg-[var(--card)] overflow-hidden ${
                                            item.type === 'audio' ? 'cursor-pointer' : ''
                                        }`}
                                        onClick={() => item.type === 'audio' && handleAudioSelect(item)}
                                    >
                                        <MobileItemName item={item} isLoading={isLoading} setIsLoading={setIsLoading}/>

                                        <ItemSize item={item} notification={notification}
                                                  copyToClipboard={copyToClipboard}/>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}