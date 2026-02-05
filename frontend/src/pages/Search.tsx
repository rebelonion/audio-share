import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { Search as SearchIcon, Folder, Music, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { searchAudio, SearchResult } from '@/lib/api';
import { DEFAULT_TITLE } from '@/lib/config';
import { useUmami } from '@/hooks/useUmami';

const RESULTS_PER_PAGE = 50;

export default function Search() {
    const { track } = useUmami();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams({});
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const totalPages = Math.ceil(total / RESULTS_PER_PAGE);

    const performSearch = useCallback(async (searchQuery: string, page: number = 1) => {
        if (searchQuery.length < 2) {
            setResults([]);
            setTotal(0);
            setHasSearched(false);
            return;
        }

        setIsLoading(true);
        const offset = (page - 1) * RESULTS_PER_PAGE;
        try {
            const response = await searchAudio(searchQuery, RESULTS_PER_PAGE, offset);
            setResults(response.results);
            setTotal(response.total);
            setHasSearched(true);
            if (page === 1) {
                track('search', { query: searchQuery, resultCount: response.total });
            }
        } catch (error) {
            console.error('Search failed:', error);
            setResults([]);
            setTotal(0);
        } finally {
            setIsLoading(false);
        }
    }, [track]);

    useEffect(() => {
        const urlQuery = searchParams.get('q');
        const urlPage = parseInt(searchParams.get('page') || '1', 10);

        if (urlQuery && urlQuery !== query) {
            setQuery(urlQuery);
            setCurrentPage(urlPage);
            performSearch(urlQuery, urlPage);
        } else if (urlQuery) {
            setCurrentPage(urlPage);
            performSearch(urlQuery, urlPage);
        }
    }, [searchParams]);

    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            if (query.length >= 2) {
                setCurrentPage(1);
                setSearchParams({ q: query }, { replace: true });
            } else if (query.length === 0) {
                setSearchParams({}, { replace: true });
                setResults([]);
                setTotal(0);
                setHasSearched(false);
            }
        }, 500);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        setCurrentPage(newPage);
        setSearchParams({ q: query, page: newPage.toString() }, { replace: true });
        performSearch(query, newPage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleResultClick = (result: SearchResult) => {
        track('search-result-click', {
            query,
            resultPath: result.path,
            resultType: result.type
        });

        if (result.type === 'audio') {
            const pathParts = result.path.split('/');
            const source = encodeURIComponent(pathParts[0]);
            const filePath = pathParts.slice(1).map(s => encodeURIComponent(s)).join('/');
            navigate(`/share/${source}/${filePath}`);
        } else {
            const encodedPath = result.path.split('/').map(s => encodeURIComponent(s)).join('/');
            navigate(`/browse/${encodedPath}`);
        }
    };

    const getParentLink = (result: SearchResult) => {
        if (!result.parentPath) return null;
        const encodedPath = result.parentPath.split('/').map(s => encodeURIComponent(s)).join('/');
        return `/browse/${encodedPath}`;
    };

    const getParentName = (result: SearchResult) => {
        if (!result.parentPath) return null;
        const parts = result.parentPath.split('/');
        return parts[parts.length - 1];
    };

    return (
        <>
            <Helmet>
                <title>Search - {DEFAULT_TITLE}</title>
                <meta name="description" content="Search for audio files across the entire library" />
            </Helmet>

            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <SearchIcon className="h-6 w-6 text-[var(--primary)]" />
                        Search Audio Library
                    </h1>

                    <div className="relative">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name, artist, title, or description..."
                            className="w-full px-4 py-3 pl-12 bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-[var(--foreground)] placeholder-[var(--muted-foreground)]"
                        />
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted-foreground)]" />
                        {isLoading && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[var(--primary)]"></div>
                            </div>
                        )}
                    </div>

                    {query.length > 0 && query.length < 2 && (
                        <p className="text-sm text-[var(--muted-foreground)] mt-2">
                            Enter at least 2 characters to search
                        </p>
                    )}
                </div>

                {hasSearched && (
                    <div className="mb-4 text-[var(--muted-foreground)]">
                        Found {total} result{total !== 1 ? 's' : ''} for "{query}"
                        {totalPages > 1 && (
                            <span> (page {currentPage} of {totalPages})</span>
                        )}
                    </div>
                )}

                {results.length > 0 && (
                    <div className="space-y-2">
                        {results.map((result) => (
                            <div
                                key={result.id}
                                onClick={() => handleResultClick(result)}
                                className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 hover:bg-[var(--card-hover)] cursor-pointer transition-colors group"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 mt-1">
                                        {result.type === 'folder' ? (
                                            <Folder className="h-5 w-5 text-[var(--primary)]" />
                                        ) : (
                                            <Music className="h-5 w-5 text-[var(--primary)]" />
                                        )}
                                    </div>

                                    <div className="flex-grow min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
                                                {result.title || result.name}
                                            </h3>
                                            <ArrowRight className="h-4 w-4 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                        </div>

                                        {result.artist && (
                                            <p className="text-sm text-[var(--muted-foreground)] truncate">
                                                {result.artist}
                                            </p>
                                        )}

                                        {result.description && (
                                            <p className="text-sm text-[var(--muted-foreground)] line-clamp-2 mt-1">
                                                {result.description}
                                            </p>
                                        )}

                                        <div className="flex items-center gap-2 mt-2 text-xs text-[var(--muted-foreground)]">
                                            <span className="px-2 py-0.5 bg-[var(--border)] rounded">
                                                {result.type}
                                            </span>
                                            {result.parentPath && (
                                                <span className="truncate">
                                                    in{' '}
                                                    <Link
                                                        to={getParentLink(result) || '#'}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-[var(--primary)] hover:underline"
                                                    >
                                                        {getParentName(result)}
                                                    </Link>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-8">
                        <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="flex items-center gap-1 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md hover:bg-[var(--card-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Previous</span>
                        </button>

                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum: number;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = currentPage - 2 + i;
                                }

                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => handlePageChange(pageNum)}
                                        className={`px-3 py-2 rounded-md transition-colors ${
                                            currentPage === pageNum
                                                ? 'bg-[var(--primary)] text-white'
                                                : 'bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--card-hover)]'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="flex items-center gap-1 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md hover:bg-[var(--card-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <span className="hidden sm:inline">Next</span>
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {hasSearched && results.length === 0 && !isLoading && (
                    <div className="text-center py-12">
                        <Music className="h-12 w-12 mx-auto text-[var(--muted-foreground)] mb-4" />
                        <h2 className="text-lg font-medium mb-2">No results found</h2>
                        <p className="text-[var(--muted-foreground)]">
                            Try searching with different keywords
                        </p>
                    </div>
                )}

                {!hasSearched && !isLoading && (
                    <div className="text-center py-12">
                        <SearchIcon className="h-12 w-12 mx-auto text-[var(--muted-foreground)] mb-4" />
                        <h2 className="text-lg font-medium mb-2">Search the entire library</h2>
                        <p className="text-[var(--muted-foreground)]">
                            Find audio files and folders by name, artist, title, or description
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
