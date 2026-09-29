import {iconButtonClass} from '@/components/ui/buttonStyles';
import {IconButton} from '@/components/ui/Button';
import {Check, Download, ExternalLink, Unlink, Share2} from "lucide-react";
import type {MouseEvent} from 'react';
import type {FileSystemItem} from '@/types';
import {useRybbit} from "@/hooks/useRybbit";
import {isMatureAge} from "@/lib/api";
import TrackQuickActions from '@/components/TrackQuickActions';
import {audioFileToPlayerTrack} from '@/lib/tracks';

export interface ItemActionsProps {
    mobile?: boolean;
    item: FileSystemItem;
    copiedShareKey: string | null;
    copyToClipboard: (shareKey: string, e: MouseEvent<HTMLButtonElement>) => void;
    onDownloadRequest: (item: FileSystemItem) => void;
    onMatureDownloadRequest: (item: FileSystemItem) => void;
}

export default function ItemActions({ item, copiedShareKey, copyToClipboard, onDownloadRequest, onMatureDownloadRequest, mobile = false }: ItemActionsProps) {
    const {track} = useRybbit();

    return(
        <>
            {item.type === 'audio' && (
                <div className={mobile ? "flex gap-1 justify-end" : "flex gap-2 justify-end"}>
                    <TrackQuickActions track={audioFileToPlayerTrack(item)} compact={!mobile} className="shrink-0" />
                    <a
                        href={item.type === 'audio' && item.shareKey ? `/share/${item.shareKey}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={iconButtonClass({variant: 'primary', size: mobile ? 'md' : 'sm'})}
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
                    <IconButton
                        variant="primary"
                        size={mobile ? 'md' : 'sm'}
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
                    </IconButton>
                    <IconButton
                        type="button"
                        variant="primary"
                        size={mobile ? 'md' : 'sm'}
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
                    </IconButton>
                </div>
            )}
            {item.type === 'folder' && item.metadata?.original_url && (
                <div className={mobile ? "flex gap-1 justify-end" : "flex gap-2 justify-end"}>
                    <a
                        href={item.metadata.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={iconButtonClass({variant: item.metadata.url_broken ? 'subtle' : 'primary', size: mobile ? 'md' : 'sm', className: item.metadata.url_broken ? 'opacity-60' : ''})}
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
        </>
    )
}

