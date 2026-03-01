import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router';
import { ExternalLink, Folder } from 'lucide-react';
import { fetchRequests } from '@/lib/api';
import { DEFAULT_TITLE } from '@/lib/config';
import type { SourceRequest, RequestsByStatus, RequestStatus } from '@/types';

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string }> = {
    requested: { label: 'Requested', color: 'var(--muted-foreground)' },
    downloading: { label: 'Downloading', color: '#3b82f6' },
    indexing: { label: 'Indexing', color: '#f59e0b' },
    added: { label: 'Added', color: '#10b981' },
    rejected: { label: 'Rejected', color: '#ef4444' },
};

function RequestCard({ request }: { request: SourceRequest }) {
    return (
        <div className="bg-[var(--card)] rounded-lg shadow-md overflow-hidden flex flex-col">
            {request.imageUrl && (
                <div className="aspect-video bg-[var(--background)] overflow-hidden">
                    <img
                        src={request.imageUrl}
                        alt={request.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                </div>
            )}
            <div className="p-3 flex flex-col gap-2 flex-1">
                <h3 className="font-medium text-[var(--foreground)] line-clamp-2 text-sm">
                    {request.title}
                </h3>

                {request.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {request.tags.map((tag, idx) => (
                            <span
                                key={idx}
                                className="text-xs px-2 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: tag.color }}
                            >
                                {tag.name}
                            </span>
                        ))}
                    </div>
                )}

                <div className="mt-auto pt-2 flex items-center gap-2">
                    <a
                        href={request.submittedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] flex items-center gap-1 truncate"
                    >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">Source</span>
                    </a>

                    {request.status === 'added' && request.folderShareKey && (
                        <Link
                            to={`/share/${request.folderShareKey}`}
                            className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] flex items-center gap-1 ml-auto"
                        >
                            <Folder className="w-3 h-3 flex-shrink-0" />
                            <span>Browse</span>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}

function Column({ status, requests }: { status: RequestStatus; requests: SourceRequest[] }) {
    const config = STATUS_CONFIG[status];

    return (
        <div className="flex-shrink-0 w-64 sm:w-72 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
                <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: config.color }}
                />
                <h2 className="font-semibold text-[var(--foreground)]">{config.label}</h2>
                <span className="text-sm text-[var(--muted-foreground)]">({requests.length})</span>
            </div>
            <div className="flex flex-col gap-3 flex-1 min-h-[200px]">
                {requests.length === 0 ? (
                    <div className="text-sm text-[var(--muted-foreground)] text-center py-8 bg-[var(--card)] rounded-lg border border-dashed border-[var(--border)]">
                        No requests
                    </div>
                ) : (
                    requests.map((request) => (
                        <RequestCard key={request.id} request={request} />
                    ))
                )}
            </div>
        </div>
    );
}

export default function Requests() {
    const [data, setData] = useState<RequestsByStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadRequests() {
            try {
                const result = await fetchRequests();
                setData(result);
            } catch (err) {
                console.error('Failed to load requests:', err);
                setError('Failed to load requests');
            } finally {
                setLoading(false);
            }
        }
        loadRequests();
    }, []);

    if (loading) {
        return (
            <div className="max-w-full mx-auto px-4 py-4 sm:py-8">
                <div className="h-10 bg-[var(--border)] rounded w-48 mb-8 animate-pulse" />
                <div className="flex gap-4 overflow-x-auto pb-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex-shrink-0 w-64 sm:w-72">
                            <div className="h-6 bg-[var(--border)] rounded w-32 mb-3 animate-pulse" />
                            <div className="space-y-3">
                                {[...Array(2)].map((_, j) => (
                                    <div key={j} className="h-32 bg-[var(--border)] rounded animate-pulse" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
                <h1 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-8 text-[var(--foreground)]">
                    Source Requests
                </h1>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
                    {error}
                </div>
            </div>
        );
    }

    const statuses: RequestStatus[] = ['requested', 'downloading', 'indexing', 'added', 'rejected'];

    return (
        <>
            <Helmet>
                <title>{DEFAULT_TITLE} - Requests</title>
                <meta name="description" content="View source request status and progress" />
            </Helmet>
            <div className="max-w-full mx-auto px-4 py-4 sm:py-8">
                <h1 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-8 text-[var(--foreground)]">
                    Source Requests
                </h1>

                <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
                    {data && statuses.map((status) => (
                        <Column
                            key={status}
                            status={status}
                            requests={data[status]}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}
