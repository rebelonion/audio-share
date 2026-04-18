import {Folder, Music, Unlink} from "lucide-react";
import {formatDate, formatFileSize} from "@/lib/utils";
import DesktopItemActions from "@/components/DesktopItemActions";
import React from "react";
import {FileSystemItem, Notification} from "@/types";
import {Link} from 'react-router';
import PosterImage from '@/components/PosterImage';

interface TableItemProps {
    item: FileSystemItem;
    handleAudioSelect: (item: FileSystemItem) => void;
    notification: Notification;
    copyToClipboard: (path: string, e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

export default function TableItem({ item, handleAudioSelect, notification, copyToClipboard }: TableItemProps) {
    const folderHref = `/browse/${item.path.split('/').map(s => encodeURIComponent(s)).join('/')}`;

    return (
        <tr
            className={`file-row hover:bg-[var(--card-hover)] ${
                item.type === 'audio' ? 'cursor-pointer' : ''
            } ${item.type === 'audio' && item.unavailableAt ? 'bg-amber-500/5 hover:bg-amber-500/10' : ''}`}
            title={item.type === 'audio' && item.unavailableAt ? 'The original source of this audio is no longer available.' : undefined}
            onClick={() => item.type === 'audio' && handleAudioSelect(item)}
        >
            <td className="px-6 py-4 whitespace-nowrap overflow-hidden text-ellipsis"
                style={{width: '55%'}}>
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
                            {item.unavailableAt && (
                                <Unlink className="absolute -bottom-1 -right-1 h-3 w-3 text-amber-500" aria-label="Source unavailable"/>
                            )}
                        </div>
                        <span className="truncate" title={item.title || item.name}>{item.title || item.name}</span>
                    </div>
                )}
            </td>
            <td className="px-6 py-4 text-sm text-[var(--muted-foreground)] text-center"
                style={{width: '20%'}}>
                {item.type === 'audio' ? formatFileSize(item.size) :
                    (item.type === 'folder' && (item.size || item.metadata?.items)) ?
                        [item.size ? formatFileSize(item.size) : null, item.metadata?.items ? `${item.metadata.items} items` : null]
                            .filter(Boolean).join(' | ')
                        : '-'}
            </td>
            <td className="px-6 py-4 text-sm text-[var(--muted-foreground)] text-center"
                style={{width: '15%'}}>
                {formatDate(item.modifiedAt)}
            </td>
            <DesktopItemActions item={item} notification={notification} copyToClipboard={copyToClipboard} />
        </tr>
    )
}
