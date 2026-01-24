import {Folder, Music} from "lucide-react";
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
            }`}
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
                        {item.posterImage ? (
                            <PosterImage
                                path={item.path}
                                posterImage={item.posterImage}
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
                        <Music className="h-5 w-5 min-w-[20px] mr-2 text-[var(--primary)]"/>
                        <span className="truncate" title={item.name}>{item.name}</span>
                    </div>
                )}
            </td>
            <td className="px-6 py-4 text-sm text-[var(--muted-foreground)] text-center"
                style={{width: '20%'}}>
                {item.type === 'audio' ? formatFileSize(item.size) :
                    (item.type === 'folder' && item.metadata?.directory_size) ?
                        `${item.metadata.directory_size}${item.metadata.items ? ` | ${item.metadata.items} items` : ''}` :
                        (item.type === 'folder' && item.metadata?.items) ?
                            `${item.metadata.items} items` : '-'}
            </td>
            <td className="px-6 py-4 text-sm text-[var(--muted-foreground)] text-center"
                style={{width: '15%'}}>
                {formatDate(item.modifiedAt)}
            </td>
            <DesktopItemActions item={item} notification={notification} copyToClipboard={copyToClipboard} />
        </tr>
    )
}
