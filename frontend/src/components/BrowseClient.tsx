import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { fetchDirectoryContents, FileSystemItem } from '@/lib/api';
import FolderView from './FolderView';
import Breadcrumb from './Breadcrumb';

interface BrowseClientProps {
    initialPath?: string;
    showTitle?: boolean;
}

function SkeletonRow() {
    return (
        <div className="flex items-center p-3 border-b border-[var(--border)]">
            <div className="w-8 h-8 rounded bg-[var(--border)] animate-pulse mr-3" />
            <div className="flex-1">
                <div className="h-4 bg-[var(--border)] rounded animate-pulse w-3/4" />
            </div>
            <div className="hidden md:block w-24 h-4 bg-[var(--border)] rounded animate-pulse mx-4" />
            <div className="hidden md:block w-20 h-4 bg-[var(--border)] rounded animate-pulse" />
        </div>
    );
}

function BrowseSkeleton() {
    return (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="p-3 border-b border-[var(--border)]">
                <div className="h-8 bg-[var(--border)] rounded animate-pulse w-64" />
            </div>
            {[...Array(8)].map((_, i) => (
                <SkeletonRow key={i} />
            ))}
        </div>
    );
}

export default function BrowseClient({ initialPath = '', showTitle = false }: BrowseClientProps) {
    const [searchParams] = useSearchParams();
    const [items, setItems] = useState<FileSystemItem[]>([]);
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const raw = searchParams.get('raw') === 'true';

    useEffect(() => {
        let mounted = true;

        async function loadDirectory() {
            setLoading(true);
            setError(null);

            try {
                const data = await fetchDirectoryContents(initialPath, { raw });
                if (mounted) {
                    setItems(data.items);
                    setCurrentPath(data.currentPath);
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Failed to load directory');
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        }

        loadDirectory();

        return () => {
            mounted = false;
        };
    }, [initialPath, raw]);

    if (loading) {
        return (
            <div>
                {showTitle && (
                    <div className="h-8 bg-[var(--border)] rounded animate-pulse w-48 mb-6" />
                )}
                {initialPath && (
                    <div className="h-6 bg-[var(--border)] rounded animate-pulse w-64 mb-4" />
                )}
                <BrowseSkeleton />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8 text-red-500">
                <p>{error}</p>
            </div>
        );
    }

    const directoryTitle = items.length === 1
        ? 'Audio Directory'
        : 'Audio Directories';

    return (
        <div>
            {showTitle && currentPath === '' && (
                <h2 className="text-2xl font-bold mb-6">{directoryTitle}</h2>
            )}
            {currentPath !== '' && <Breadcrumb path={currentPath} />}
            <FolderView items={items} currentPath={currentPath} />
        </div>
    );
}
