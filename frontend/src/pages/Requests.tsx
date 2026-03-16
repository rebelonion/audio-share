import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router';
import { ExternalLink, Folder } from 'lucide-react';
import { fetchRequests } from '@/lib/api';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';
import type { SourceRequest, RequestsByStatus, RequestStatus } from '@/types';

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string }> = {
    requested: { label: 'Requested', color: 'var(--muted-foreground)' },
    downloading: { label: 'Downloading', color: '#3b82f6' },
    indexing: { label: 'Indexing', color: '#f59e0b' },
    added: { label: 'Added', color: '#10b981' },
    rejected: { label: 'Rejected', color: '#ef4444' },
};

function formatDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((nowDay.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
}

function getDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return 'Source';
    }
}

function RequestCard({ request, accentColor }: { request: SourceRequest; accentColor: string }) {
    return (
        <div className="bg-[var(--card)] rounded-lg shadow-sm overflow-hidden flex flex-row hover:shadow-md transition-shadow border border-[var(--border)] flex-shrink-0">
            <div
                className="w-1 flex-shrink-0 rounded-l-lg"
                style={{ backgroundColor: accentColor }}
            />
            <div className="p-3 flex flex-col gap-1.5 flex-1 min-w-0">
                <h3 className="font-medium text-[var(--foreground)] line-clamp-2 text-sm leading-snug">
                    {request.title}
                </h3>

                {request.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {request.tags.map((tag, i) => (
                            <span
                                key={`${i}-${tag.name}-${tag.color}`}
                                className="text-xs px-1.5 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: tag.color }}
                            >
                                {tag.name}
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2 mt-1">
                    <a
                        href={request.submittedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] flex items-center gap-1 min-w-0"
                    >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{getDomain(request.submittedUrl)}</span>
                    </a>

                    <span className="text-xs text-[var(--muted-foreground)] ml-auto flex-shrink-0">
                        {formatDate(request.createdAt)}
                    </span>

                    {request.folderPath && (
                        <Link
                            to={`/browse/${request.folderPath.split('/').map(encodeURIComponent).join('/')}`}
                            className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] flex items-center gap-1 flex-shrink-0"
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
        <div className="flex-shrink-0 w-64 sm:w-72 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-3">
                <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: config.color }}
                />
                <h2 className="font-semibold text-[var(--foreground)]">{config.label}</h2>
                <span className="text-sm text-[var(--muted-foreground)]">({requests.length})</span>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 193px)' }}>
                {requests.length === 0 ? (
                    <div className="text-sm text-[var(--muted-foreground)] text-center py-8 bg-[var(--card)] rounded-lg border border-dashed border-[var(--border)]">
                        No requests
                    </div>
                ) : (
                    requests.map((request) => (
                        <RequestCard key={request.id} request={request} accentColor={config.color} />
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
            <>
                <div className="h-10 bg-[var(--border)] rounded w-48 mb-8 animate-pulse mx-auto" />
                <div className="overflow-x-auto pb-4">
                    <div className="flex gap-4 w-fit mx-auto">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex-shrink-0 w-64 sm:w-72">
                                <div className="h-6 bg-[var(--border)] rounded w-32 mb-3 animate-pulse" />
                                <div className="space-y-3">
                                    {[...Array(2)].map((_, j) => (
                                        <div key={j} className="h-24 bg-[var(--border)] rounded animate-pulse" />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                <h1 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-8 text-[var(--foreground)] text-center">
                    Source Requests
                </h1>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
                    {error}
                </div>
            </>
        );
    }

    const statuses: RequestStatus[] = ['requested', 'downloading', 'indexing', 'added', 'rejected'];

    return (
        <div className="-mb-8">
            <Helmet>
                <title>{DEFAULT_TITLE} - Requests</title>
                <meta name="description" content={`${DEFAULT_DESCRIPTION} — Requests`} />
            </Helmet>
            <h1 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-6 text-[var(--foreground)] text-center">
                Source Requests
            </h1>

            <div className="overflow-x-auto">
                <div className="flex gap-4 w-fit mx-auto">
                    {data && statuses.map((status) => (
                        <Column
                            key={status}
                            status={status}
                            requests={data[status]}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
