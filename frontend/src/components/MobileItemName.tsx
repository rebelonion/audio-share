import {Folder, Music} from "lucide-react";
import {FileSystemItem} from "@/types";
import {Link} from 'react-router';
import PosterImage from '@/components/PosterImage';

interface ItemNameProps {
    item: FileSystemItem;
}

export default function MobileItemName({ item }: ItemNameProps) {
    const folderHref = `/browse/${item.path.split('/').map(s => encodeURIComponent(s)).join('/')}`;

    return (
        <div className="p-3 flex items-center">
            <div className="mr-3 flex items-center">
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
                    <Music className="h-5 w-5 text-[var(--primary)]"/>
                )}
            </div>

            <div className="flex-1 overflow-hidden">
                {item.type === 'folder' ? (
                    <Link
                        to={folderHref}
                        className="text-[var(--primary)] hover:text-[var(--primary-hover)] block w-full text-left"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="font-medium truncate">
                            {item.name}
                        </div>
                    </Link>
                ) : (
                    <div className="font-medium truncate">{item.name}</div>
                )}
            </div>
        </div>
    )
}
