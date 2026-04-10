import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
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
            <div className="w-8 h-8 rounded skeleton mr-3 flex-shrink-0" />
            <div className="flex-1">
                <div className="h-4 skeleton rounded w-3/4" />
            </div>
            <div className="hidden md:block w-24 h-4 skeleton rounded mx-4" />
            <div className="hidden md:block w-20 h-4 skeleton rounded" />
        </div>
    );
}

function BrowseSkeleton() {
    return (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="p-3 border-b border-[var(--border)]">
                <div className="h-8 skeleton rounded w-64" />
            </div>
            {[...Array(8)].map((_, i) => (
                <SkeletonRow key={i} />
            ))}
        </div>
    );
}

export default function BrowseClient({ initialPath = '', showTitle = false }: BrowseClientProps) {
    const navigate = useNavigate();
    const [items, setItems] = useState<FileSystemItem[]>([]);
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        async function loadDirectory() {
            setLoading(true);
            setError(null);

            try {
                const data = await fetchDirectoryContents(initialPath);
                if (mounted) {
                    setItems(data.items);
                    setCurrentPath(data.currentPath);

                    if (data.currentPath && data.currentPath !== initialPath) {
                        const encodedPath = data.currentPath
                            .split('/')
                            .map(segment => encodeURIComponent(segment))
                            .join('/');
                        navigate(`/browse/${encodedPath}`, { replace: true });
                    }
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
    }, [initialPath]);

    if (loading) {
        return (
            <div>
                {showTitle && (
                    <div className="h-8 skeleton rounded w-48 mb-6" />
                )}
                {initialPath && (
                    <div className="h-6 skeleton rounded w-64 mb-4" />
                )}
                <BrowseSkeleton />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-[var(--card)] border border-red-900/40 rounded-lg p-8 text-center">
                <p className="text-red-400 text-sm">{error}</p>
            </div>
        );
    }

    const directoryTitle = items.length === 1
        ? 'Audio Directory'
        : 'Audio Directories';

    return (
        <div>
            {showTitle && currentPath === '' && (
                <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)' }}>{directoryTitle}</h2>
            )}
            {currentPath !== '' && <Breadcrumb path={currentPath} />}
            <FolderView items={items} />
        </div>
    );
}
