import {Check, Download, ExternalLink, Unlink, Share2} from "lucide-react";
import React from "react";
import {FileSystemItem} from "@/types";
import {useRybbit} from "@/hooks/useRybbit";
import {isMatureAge} from "@/lib/api";
import TrackQuickActions from '@/components/TrackQuickActions';
import {audioFileToPlayerTrack} from '@/lib/tracks';

interface DesktopItemActionsProps {
    item: FileSystemItem;
    copiedShareKey: string | null,
    copyToClipboard: (shareKey: string, e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    onDownloadRequest: (item: FileSystemItem) => void;
    onMatureDownloadRequest: (item: FileSystemItem) => void;
}

function DesktopItemActions({ item, copiedShareKey, copyToClipboard, onDownloadRequest, onMatureDownloadRequest }: DesktopItemActionsProps) {
    const {track} = useRybbit();

    return(
        <td className="px-4 py-4 whitespace-nowrap text-sm text-right"
            style={{width: '20%'}}>
            {item.type === 'audio' && (
                <div className="flex gap-2 justify-end">
                    <TrackQuickActions track={audioFileToPlayerTrack(item)} compact />
                    <a
                        href={item.type === 'audio' && item.shareKey ? `/share/${item.shareKey}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1.5 rounded-full hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            e.stopPropagation();
                            track('share-page-open', {
                                path: item.path,
                                name: item.name,
                                source: 'browse',
                            });
                        }}
                        title="Open share page"
                    >
                        <ExternalLink className="h-4 w-4"/>
                    </a>
                    <button
                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1.5 rounded-full hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            const key = item.type === 'audio' ? (item.shareKey || '') : '';
                            copyToClipboard(key, e);
                            track('audio-share', { path: item.path, name: item.name });
                        }}
                        title="Copy share link"
                    >
                        {copiedShareKey === (item.type === 'audio' ? item.shareKey : '') ?
                            <Check className="h-4 w-4"/> :
                            <Share2 className="h-4 w-4"/>
                        }
                    </button>
                    <button
                        type="button"
                        className="inline-flex items-center justify-center bg-[var(--primary)] text-white p-1.5 rounded-full hover:bg-[var(--primary-hover)]"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (item.type === 'audio' && isMatureAge(item.ageLimit) && sessionStorage.getItem('mature-download-warning-ack') !== 'true') {
                                onMatureDownloadRequest(item);
                                return;
                            }
                            onDownloadRequest(item);
                        }}
                        title="Download"
                    >
                        <Download className="h-4 w-4"/>
                    </button>
                </div>
            )}
            {item.type === 'folder' && item.metadata?.original_url && (
                <div className="flex gap-2 justify-end">
                    <a
                        href={item.metadata.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center justify-center p-1.5 rounded-full ${
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
                            <Unlink className="h-4 w-4"/>
                        ) : (
                            <ExternalLink className="h-4 w-4"/>
                        )}
                    </a>
                </div>
            )}
        </td>
    )
}

export default React.memo(DesktopItemActions);
