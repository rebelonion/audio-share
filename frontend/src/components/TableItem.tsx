import {Folder, Music, ShieldAlert, Unlink} from "lucide-react";
import {formatDate, formatDuration, formatFileSize} from "@/lib/utils";
import DesktopItemActions from "@/components/DesktopItemActions";
import React from "react";
import {FileSystemItem} from "@/types";
import {Link} from 'react-router';
import PosterImage from '@/components/PosterImage';

interface TableItemProps {
    item: FileSystemItem;
    showDurationColumn: boolean;
    handleAudioSelect: (item: FileSystemItem) => void;
    copiedShareKey: string | null;
    copyToClipboard: (path: string, e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    onDownloadRequest: (item: FileSystemItem) => void;
    onMatureDownloadRequest: (item: FileSystemItem) => void;
}

function TableItem({ item, showDurationColumn, handleAudioSelect, copiedShareKey, copyToClipboard, onDownloadRequest, onMatureDownloadRequest }: TableItemProps) {
    const folderHref = `/browse/${item.path.split('/').map(s => encodeURIComponent(s)).join('/')}`;
    const nameColumnWidth = showDurationColumn ? '35%' : '45%';
    const sizeColumnWidth = showDurationColumn ? '17%' : '20%';

    return (
        <tr
            className={`file-row h-[65px] border-t border-[var(--border)] hover:bg-[var(--card-hover)] ${
                item.type === 'audio' ? 'cursor-pointer' : ''
            } ${item.type === 'audio' && (item.unavailableAt || item.removalRequestedAt) ? 'bg-amber-500/5 hover:bg-amber-500/10' : ''}`}
            title={item.type === 'audio' && item.removalRequestedAt
                ? 'A removal request has been received. This item is only visible on the local network.'
                : item.type === 'audio' && item.unavailableAt
                    ? 'The original source of this audio is no longer available.'
                    : undefined}
            onClick={() => item.type === 'audio' && handleAudioSelect(item)}
        >
            <td className="px-6 py-4 whitespace-nowrap overflow-hidden text-ellipsis"
                style={{width: nameColumnWidth}}>
                {item.type === 'folder' ? (
                    <Link
                        to={folderHref}
                        className="flex items-center text-[var(--primary)] hover:text-[var(--primary-hover)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {item.posterImage && item.type === 'folder' && item.shareKey ? (
                            <PosterImage
                                shareKey={item.shareKey}
                                className="w-8 h-8 min-w-[32px] mr-2 rounded object-cover shadow-sm"
                            />
                        ) : (
                            <div className="w-8 h-8 min-w-[32px] mr-2 flex items-center justify-center">
                                <Folder className="h-6 w-6 text-[var(--primary)]"/>
                            </div>
                        )}
                        <span className="truncate" title={item.name}>{item.name}</span>
                    </Link>
                ) : (
                    <div className="flex items-center text-[var(--foreground)]">
                        <div className="relative mr-2">
                            <Music className="h-5 w-5 min-w-[20px] text-[var(--primary)]"/>
                            {item.removalRequestedAt ? (
                                <ShieldAlert className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-amber-500" aria-label="Removal requested"/>
                            ) : item.unavailableAt ? (
                                <Unlink className="absolute -bottom-1 -right-1 h-3 w-3 text-amber-500" aria-label="Source unavailable"/>
                            ) : null}
                        </div>
                        <span className="truncate" title={item.title || item.name}>{item.title || item.name}</span>
                        {item.removalRequestedAt && (
                            <span className="ml-2 shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-500">Removal requested</span>
                        )}
                    </div>
                )}
            </td>
            <td className="px-6 py-4 text-sm text-[var(--muted-foreground)] text-center"
                style={{width: sizeColumnWidth}}>
                {item.type === 'audio' ? formatFileSize(item.size) :
                    (item.type === 'folder' && (item.size || item.metadata?.items)) ?
                        [item.size ? formatFileSize(item.size) : null, item.metadata?.items ? `${item.metadata.items} items` : null]
                            .filter(Boolean).join(' | ')
                        : '-'}
            </td>
            {showDurationColumn && (
                <td className="px-6 py-4 text-sm text-[var(--muted-foreground)] text-center tabular-nums"
                    style={{width: '13%'}}>
                    {item.type === 'audio' && item.durationSeconds ? formatDuration(item.durationSeconds) : '-'}
                </td>
            )}
            <td className="px-6 py-4 text-sm text-[var(--muted-foreground)] text-center"
                style={{width: '15%'}}>
                {formatDate(item.modifiedAt)}
            </td>
            <DesktopItemActions
                item={item}
                copiedShareKey={copiedShareKey}
                copyToClipboard={copyToClipboard}
                onDownloadRequest={onDownloadRequest}
                onMatureDownloadRequest={onMatureDownloadRequest}
            />
        </tr>
    )
}

export default React.memo(TableItem);
