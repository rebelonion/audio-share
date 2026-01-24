import {FileSystemItem, Notification} from "@/types";
import {Check, Download, ExternalLink, Unlink, Share2} from "lucide-react";
import React from "react";
import {formatDate, formatFileSize} from "@/lib/utils";
import {useUmami} from "@/hooks/useUmami";
import {API_BASE} from "@/lib/api";

interface MobileItemDetailsProps {
    item: FileSystemItem;
    notification: Notification,
    copyToClipboard: (path: string, e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

export default function MobileItemDetails({ item, notification, copyToClipboard }: MobileItemDetailsProps) {
    const {track} = useUmami();
    return (
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
                        onClick={(e) => {
                            copyToClipboard(item.path, e);
                            track('audio-share', { path: item.path, name: item.name });
                        }}
                        title="Share"
                    >
                        {notification.visible && notification.path === item.path && !notification.isError ?
                            <Check className="h-3 w-3"/> :
                            <Share2 className="h-3 w-3"/>
                        }
                    </button>
                    <a
                        href={`${API_BASE}/api/audio/${item.path.split('/').map(segment => encodeURIComponent(segment)).join('/')}`}
                        download
                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1 rounded-full hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            e.stopPropagation();
                            track('audio-download', { path: item.path, name: item.name });
                        }}
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
                        className={`inline-flex items-center justify-center p-1 rounded-full ${
                            item.metadata.url_broken
                                ? 'bg-gray-400 text-white opacity-60'
                                : 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]'
                        }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            track(
                                item.metadata?.url_broken ? 'external-link-broken-click' : 'external-link-click',
                                { url: item.metadata?.original_url, folder: item.name }
                            );
                        }}
                        title={item.metadata.url_broken ? 'Source Link Broken' : 'Visit Original Source'}
                    >
                        {item.metadata.url_broken ? (
                            <Unlink className="h-3 w-3"/>
                        ) : (
                            <ExternalLink className="h-3 w-3"/>
                        )}
                    </a>
                </div>
            )}
        </div>
    );
}
