import {FileSystemItem, Notification} from "@/types";
import {Check, Download, ExternalLink, Unlink, Share2} from "lucide-react";
import React from "react";
import {formatDate, formatDuration, formatFileSize} from "@/lib/utils";
import {useRybbit} from "@/hooks/useRybbit";
import {API_BASE, isMatureAge} from "@/lib/api";

interface MobileItemDetailsProps {
    item: FileSystemItem;
    notification: Notification,
    copyToClipboard: (shareKey: string, e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    onMatureDownloadRequest: (download: { item: FileSystemItem; url: string }) => void;
}

export default function MobileItemDetails({ item, notification, copyToClipboard, onMatureDownloadRequest }: MobileItemDetailsProps) {
    const {track} = useRybbit();

    const downloadUrl = item.type === 'audio' && item.shareKey ? `${API_BASE}/api/audio/key/${item.shareKey}/download` : '#';

    return (
        <div className="px-3 pb-3 flex justify-between">
            <div className="text-xs text-[var(--muted-foreground)]">
                {item.type === 'audio' && (
                    <span className="mr-3">{formatFileSize(item.size)}</span>
                )}
                {item.type === 'folder' && item.size ? (
                    <span className="mr-3">{formatFileSize(item.size)}</span>
                ) : null}
                {item.type === 'folder' && item.metadata?.items && (
                    <span className="mr-3">{item.metadata.items} items</span>
                )}
                {item.type === 'audio' && item.durationSeconds ? (
                    <span className="mr-3">{formatDuration(item.durationSeconds)}</span>
                ) : null}
                <span>{formatDate(item.modifiedAt)}</span>
            </div>

            {item.type === 'audio' && (
                <div className="flex gap-2">
                    <a
                        href={item.type === 'audio' && item.shareKey ? `/share/${item.shareKey}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1 rounded-full hover:bg-[var(--primary-hover)]"
                        onClick={(e) => e.stopPropagation()}
                        title="Open share page"
                    >
                        <ExternalLink className="h-3 w-3"/>
                    </a>
                    <button
                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1 rounded-full hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            const key = item.type === 'audio' ? (item.shareKey || '') : '';
                            copyToClipboard(key, e);
                            track('audio-share', { path: item.path, name: item.name });
                        }}
                        title="Copy share link"
                    >
                        {notification.visible && notification.path === (item.type === 'audio' ? item.shareKey : '') && !notification.isError ?
                            <Check className="h-3 w-3"/> :
                            <Share2 className="h-3 w-3"/>
                        }
                    </button>
                    <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1 rounded-full hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (item.type === 'audio' && isMatureAge(item.ageLimit) && sessionStorage.getItem('mature-download-warning-ack') !== 'true') {
                                e.preventDefault();
                                onMatureDownloadRequest({ item, url: downloadUrl });
                                return;
                            }
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
                                ? 'bg-[var(--muted)] text-white opacity-60'
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
