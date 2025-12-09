import {Check, Download, ExternalLink, Unlink, Share2} from "lucide-react";
import React from "react";
import {FileSystemItem, Notification} from "@/types";

interface ItemActionProps {
    item: FileSystemItem;
    notification: Notification,
    copyToClipboard: (path: string, e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

export default function ItemAction({ item, notification, copyToClipboard }: ItemActionProps) {
    return(
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
                        className={`inline-flex items-center justify-center p-1.5 rounded-full ${
                            item.metadata.url_broken
                                ? 'bg-gray-400 text-white opacity-60'
                                : 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]'
                        }`}
                        onClick={(e) => e.stopPropagation()}
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