import {Folder, Loader2, Music} from "lucide-react";
import {formatDate, formatFileSize} from "@/lib/utils";
import DesktopItemActions from "@/components/DesktopItemActions";
import React from "react";
import {FileSystemItem, Notification} from "@/types";
import {useRouter} from 'next/navigation';
import PosterImage from '@/components/PosterImage';

interface TableItemProps {
    item: FileSystemItem;
    isLoading: string | null;
    setIsLoading: (path: string | null) => void;
    handleAudioSelect: (item: FileSystemItem) => void;
    notification: Notification;
    copyToClipboard: (path: string, e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

export default function TableItem({ item, isLoading, setIsLoading, handleAudioSelect, notification, copyToClipboard }: TableItemProps) {
    const router = useRouter();
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
                                className="h-6 w-6 min-w-[20px] mr-2 text-[var(--primary)] animate-spin"/>
                        ) : item.posterImage ? (
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
                    </button>
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