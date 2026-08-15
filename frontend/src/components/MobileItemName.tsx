import {Folder, Music, ShieldAlert, Unlink} from "lucide-react";
import {FileSystemItem} from "@/types";
import {Link} from 'react-router';
import PosterImage from '@/components/PosterImage';
import React from "react";

interface ItemNameProps {
    item: FileSystemItem;
}

function MobileItemName({ item }: ItemNameProps) {
    const folderHref = `/browse/${item.path.split('/').map(s => encodeURIComponent(s)).join('/')}`;

    return (
        <div className="flex min-h-16 items-start px-3 pt-3 pb-2">
            <div className="mr-3 mt-0.5 flex items-center">
                {item.type === 'folder' ? (
                    item.posterImage && item.type === 'folder' && item.shareKey ? (
                        <PosterImage
                            shareKey={item.shareKey}
                            className="w-8 h-8 rounded object-cover shadow-sm"
                        />
                    ) : (
                        <div className="w-8 h-8 flex items-center justify-center">
                            <Folder className="h-6 w-6 text-[var(--primary)]"/>
                        </div>
                    )
                ) : (
                    <div className="relative">
                        <Music className="h-5 w-5 text-[var(--primary)]"/>
                        {item.removalRequestedAt ? (
                            <ShieldAlert className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-amber-500" aria-label="Removal requested"/>
                        ) : item.unavailableAt ? (
                            <Unlink className="absolute -bottom-1 -right-1 h-3 w-3 text-amber-500" aria-label="Source unavailable"/>
                        ) : null}
                    </div>
                )}
            </div>

            <div className="min-w-0 flex-1">
                {item.type === 'folder' ? (
                    <Link
                        to={folderHref}
                        className="text-[var(--primary)] hover:text-[var(--primary-hover)] block w-full text-left"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="font-medium leading-snug line-clamp-2">
                            {item.name}
                        </div>
                    </Link>
                ) : (
                    <div
                        className="font-medium leading-snug line-clamp-2"
                        title={item.title || item.name}
                    >
                        {item.title || item.name}
                    </div>
                )}
                {item.type === 'audio' && item.removalRequestedAt && (
                    <span className="mt-1 inline-block rounded border border-amber-500/40 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-amber-500">Removal requested</span>
                )}
            </div>
        </div>
    )
}

export default React.memo(MobileItemName);
