import {Folder, Loader2, Music} from "lucide-react";
import React from "react";
import {FileSystemItem} from "@/types";
import {useRouter} from 'next/navigation';
import PosterImage from '@/components/PosterImage';

interface ItemNameProps {
    item: FileSystemItem;
    isLoading: string | null;
    setIsLoading: (path: string | null) => void;
}

export default function MobileItemName({ item, isLoading, setIsLoading }: ItemNameProps) {
    const router = useRouter();
    return (
        <div className="p-3 flex items-center">
            <div className="mr-3 flex items-center">
                {item.type === 'folder' ? (
                    item.hasPoster ? (
                        <PosterImage
                            path={item.path}
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
                    <button
                        className="text-[var(--primary)] hover:text-[var(--primary-hover)] block w-full text-left"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsLoading(item.path);
                            router.push(`/browse/${encodeURIComponent(item.path).replace(/%2F/g, '/')}`);
                        }}
                    >
                        <div className="font-medium truncate flex items-center">
                            {isLoading === item.path ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin inline"/>
                            ) : null}
                            {item.name}
                        </div>
                    </button>
                ) : (
                    <div className="font-medium truncate">{item.name}</div>
                )}
            </div>
        </div>
    )
}