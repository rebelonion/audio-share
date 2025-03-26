'use client';

import React, {useEffect, useState} from 'react';
import {Check, Download, ExternalLink, Folder, Loader2, Music, Share2} from 'lucide-react';
import {FileSystemItem} from '@/types';
import AudioPlayer from './AudioPlayer';
import {useRouter} from 'next/navigation';

interface FolderViewProps {
    items: FileSystemItem[];
    currentPath: string;
}

export default function FolderView({items}: FolderViewProps) {
    const router = useRouter();
    const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
    const [selectedAudioName, setSelectedAudioName] = useState<string>('');
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [isAudioSelectionLocked, setIsAudioSelectionLocked] = useState(false);
    const [notification, setNotification] = useState<{
        path: string,
        message: string,
        isError: boolean,
        visible: boolean
    }>({
        path: '',
        message: '',
        isError: false,
        visible: false
    });

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

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
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
                    {/* Desktop view */}
                    <div
                        className="hidden md:block bg-[var(--card)] rounded-lg shadow-lg border border-[var(--border)] overflow-hidden">
                        <div className="overflow-x-auto" style={{WebkitOverflowScrolling: 'touch'}}>
                            <table className="w-full table-fixed divide-y divide-[var(--border)]">
                                <thead className="bg-[var(--card-hover)]">
                                <tr>
                                    <th scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider"
                                        style={{width: '55%'}}>
                                        Name
                                    </th>
                                    <th scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider"
                                        style={{width: '20%'}}>
                                        Size
                                    </th>
                                    <th scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider"
                                        style={{width: '15%'}}>
                                        Modified
                                    </th>
                                    <th scope="col"
                                        className="px-6 py-3 text-right text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider"
                                        style={{width: '10%'}}>
                                        Actions
                                    </th>
                                </tr>
                                </thead>
                                <tbody className="bg-[var(--card)] divide-y divide-[var(--border)]">
                                {items.map((item) => (
                                    <tr
                                        key={`desktop-${item.path}`}
                                        className={`file-row hover:bg-[var(--card-hover)] ${
                                            item.type === 'audio' ? 'cursor-pointer' : ''
                                        }`}
                                        onClick={() => item.type === 'audio' && handleAudioSelect(item)}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap overflow-hidden text-ellipsis"
                                            style={{width: '55%'}}>
                                            {item.type === 'folder' ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsLoading(item.path);
                                                        router.push(`/browse/${encodeURIComponent(item.path).replace(/%2F/g, '/')}`);
                                                    }}
                                                    className="flex items-center text-[var(--primary)] hover:text-[var(--primary-hover)]"
                                                >
                                                    {isLoading === item.path ? (
                                                        <Loader2
                                                            className="h-5 w-5 min-w-[20px] mr-2 text-[var(--primary)] animate-spin"/>
                                                    ) : (
                                                        <Folder
                                                            className="h-5 w-5 min-w-[20px] mr-2 text-[var(--primary)]"/>
                                                    )}
                                                    <span className="truncate" title={item.name}>{item.name}</span>
                                                </button>
                                            ) : (
                                                <div className="flex items-center text-[var(--foreground)]">
                                                    <Music className="h-5 w-5 min-w-[20px] mr-2 text-[var(--primary)]"/>
                                                    <span className="truncate" title={item.name}>{item.name}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted-foreground)]"
                                            style={{width: '20%'}}>
                                            {item.type === 'audio' ? formatFileSize(item.size) :
                                                (item.type === 'folder' && item.metadata?.directory_size) ?
                                                    `${item.metadata.directory_size}${item.metadata.items ? ` | ${item.metadata.items} items` : ''}` :
                                                    (item.type === 'folder' && item.metadata?.items) ?
                                                        `${item.metadata.items} items` : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted-foreground)]"
                                            style={{width: '15%'}}>
                                            {formatDate(item.modifiedAt)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right"
                                            style={{width: '10%'}}>
                                            {item.type === 'audio' && (
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1.5 rounded-full hover:bg-[var(--primary-hover)]"
                                                        onClick={(e) => copyToClipboard(item.path, e)}
                                                        title="Share"
                                                    >
                                                        {notification.visible && notification.path === item.path && !notification.isError ?
                                                            <Check className="h-4 w-4"/> :
                                                            <Share2 className="h-4 w-4"/>
                                                        }
                                                    </button>
                                                    <a
                                                        href={`/api/audio/${item.path.split('/').map(segment => encodeURIComponent(segment)).join('/')}`}
                                                        download
                                                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1.5 rounded-full hover:bg-[var(--primary-hover)]"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Download"
                                                    >
                                                        <Download className="h-4 w-4"/>
                                                    </a>
                                                </div>
                                            )}
                                            {item.type === 'folder' && item.metadata?.original_url && (
                                                <div className="flex gap-2 justify-end">
                                                    <a
                                                        href={item.metadata.original_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1.5 rounded-full hover:bg-[var(--primary-hover)]"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Visit Original Source"
                                                    >
                                                        <ExternalLink className="h-4 w-4"/>
                                                    </a>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile view */}
                    <div className="md:hidden">
                        {items.map((item) => (
                            <div
                                key={`mobile-${item.path}`}
                                className={`border border-[var(--border)] rounded-lg mb-3 bg-[var(--card)] overflow-hidden ${
                                    item.type === 'audio' ? 'cursor-pointer' : ''
                                }`}
                                onClick={() => item.type === 'audio' && handleAudioSelect(item)}
                            >
                                <div className="p-3 flex items-center">
                                    <div className="mr-3">
                                        {item.type === 'folder' ? (
                                            <Folder className="h-5 w-5 text-[var(--primary)]"/>
                                        ) : (
                                            <Music className="h-5 w-5 text-[var(--primary)]"/>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-hidden">
                                        {item.type === 'folder' ? (
                                            <button
                                                className="text-[var(--primary)] hover:text-[var(--primary-hover)] block w-full text-left"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsLoading(item.path);
                                                    router.push(`/browse/${encodeURIComponent(item.path).replace(/%2F/g, '/')}`);
                                                }}
                                            >
                                                <div className="font-medium truncate flex items-center">
                                                    {isLoading === item.path ? (
                                                        <Loader2 className="h-4 w-4 mr-1 animate-spin inline"/>
                                                    ) : null}
                                                    {item.name}
                                                </div>
                                            </button>
                                        ) : (
                                            <div className="font-medium truncate">{item.name}</div>
                                        )}
                                    </div>
                                </div>

                                <div className="px-3 pb-3 flex justify-between">
                                    <div className="text-xs text-[var(--muted-foreground)]">
                                        {item.type === 'audio' && (
                                            <span className="mr-3">{formatFileSize(item.size)}</span>
                                        )}
                                        {item.type === 'folder' && item.metadata?.directory_size && (
                                            <span className="mr-3">{item.metadata.directory_size}</span>
                                        )}
                                        {item.type === 'folder' && item.metadata?.items && (
                                            <span className="mr-3">{item.metadata.items} items</span>
                                        )}
                                        <span>{formatDate(item.modifiedAt)}</span>
                                    </div>

                                    {item.type === 'audio' && (
                                        <div className="flex gap-2">
                                            <button
                                                className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1 rounded-full hover:bg-[var(--primary-hover)]"
                                                onClick={(e) => copyToClipboard(item.path, e)}
                                                title="Share"
                                            >
                                                {notification.visible && notification.path === item.path && !notification.isError ?
                                                    <Check className="h-3 w-3"/> :
                                                    <Share2 className="h-3 w-3"/>
                                                }
                                            </button>
                                            <a
                                                href={`/api/audio/${item.path.split('/').map(segment => encodeURIComponent(segment)).join('/')}`}
                                                download
                                                className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1 rounded-full hover:bg-[var(--primary-hover)]"
                                                onClick={(e) => e.stopPropagation()}
                                                title="Download"
                                            >
                                                <Download className="h-3 w-3"/>
                                            </a>
                                        </div>
                                    )}
                                    {item.type === 'folder' && item.metadata?.original_url && (
                                        <div className="flex gap-2">
                                            <a
                                                href={item.metadata.original_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1 rounded-full hover:bg-[var(--primary-hover)]"
                                                onClick={(e) => e.stopPropagation()}
                                                title="Visit Original Source"
                                            >
                                                <ExternalLink className="h-3 w-3"/>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}