import {FileSystemItem} from "@/types";
import {Check, Download, ExternalLink, Unlink, Share2} from "lucide-react";
import React from "react";
import {formatDate, formatDuration, formatFileSize} from "@/lib/utils";
import {useRybbit} from "@/hooks/useRybbit";
import {isMatureAge} from "@/lib/api";
import TrackQuickActions from '@/components/TrackQuickActions';
import {audioFileToPlayerTrack} from '@/lib/tracks';

interface MobileItemDetailsProps {
    item: FileSystemItem;
    copiedShareKey: string | null,
    copyToClipboard: (shareKey: string, e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    onDownloadRequest: (item: FileSystemItem) => void;
    onMatureDownloadRequest: (item: FileSystemItem) => void;
}

function MobileItemDetails({ item, copiedShareKey, copyToClipboard, onDownloadRequest, onMatureDownloadRequest }: MobileItemDetailsProps) {
    const {track} = useRybbit();
    const metadata = [
        item.type === 'audio' ? formatFileSize(item.size) : item.size ? formatFileSize(item.size) : null,
        item.type === 'folder' && item.metadata?.items ? `${item.metadata.items} items` : null,
        item.type === 'audio' && item.durationSeconds ? formatDuration(item.durationSeconds) : null,
        formatDate(item.modifiedAt),
    ].filter((value): value is string => Boolean(value));
    const detailsClass = item.type === 'audio'
        ? 'px-3 pb-3'
        : item.metadata?.original_url
            ? 'px-3 pb-2'
            : 'flex h-12 items-center px-3 pb-3';

    return (
        <div className={detailsClass}>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-xs tabular-nums text-[var(--muted-foreground)]">
                {metadata.map((value, index) => (
                    <React.Fragment key={`${value}-${index}`}>
                        {index > 0 && (
                            <span aria-hidden="true" className="text-[var(--border)]">•</span>
                        )}
                        <span>{value}</span>
                    </React.Fragment>
                ))}
            </div>

            {item.type === 'audio' && (
                <div className="-mx-3 mt-2 flex items-center justify-end gap-1 border-t border-[var(--border-subtle)] px-1 pt-2">
                    <TrackQuickActions
                        track={audioFileToPlayerTrack(item)}
                        compact
                        className="shrink-0 [column-gap:0.125rem] [&>button]:inline-flex [&>button]:h-9 [&>button]:w-9 [&>button]:shrink-0 [&>button]:items-center [&>button]:justify-center [&>button]:p-0"
                    />
                    <a
                        href={item.type === 'audio' && item.shareKey ? `/share/${item.shareKey}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            e.stopPropagation();
                            track('share-page-open', {
                                path: item.path,
                                name: item.name,
                                source: 'browse',
                            });
                        }}
                        aria-label="Open share page"
                        title="Open share page"
                    >
                        <ExternalLink className="h-4 w-4"/>
                    </a>
                    <button
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            const key = item.type === 'audio' ? (item.shareKey || '') : '';
                            copyToClipboard(key, e);
                            track('audio-share', { path: item.path, name: item.name });
                        }}
                        aria-label="Copy share link"
                        title="Copy share link"
                    >
                        {copiedShareKey === (item.type === 'audio' ? item.shareKey : '') ?
                            <Check className="h-4 w-4"/> :
                            <Share2 className="h-4 w-4"/>
                        }
                    </button>
                    <button
                        type="button"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (item.type === 'audio' && isMatureAge(item.ageLimit) && sessionStorage.getItem('mature-download-warning-ack') !== 'true') {
                                onMatureDownloadRequest(item);
                                return;
                            }
                            onDownloadRequest(item);
                        }}
                        aria-label="Download"
                        title="Download"
                    >
                        <Download className="h-4 w-4"/>
                    </button>
                </div>
            )}
            {item.type === 'folder' && item.metadata?.original_url && (
                <div className="mt-1 flex justify-end">
                    <a
                        href={item.metadata.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${
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
                        aria-label={item.metadata.url_broken ? 'Source link broken' : 'Visit original source'}
                        title={item.metadata.url_broken ? 'Source Link Broken' : 'Visit Original Source'}
                    >
                        {item.metadata.url_broken ? (
                            <Unlink className="h-4 w-4"/>
                        ) : (
                            <ExternalLink className="h-4 w-4"/>
                        )}
                    </a>
                </div>
            )}
        </div>
    );
}

export default React.memo(MobileItemDetails);
