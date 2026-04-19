import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { Search as SearchIcon, Folder, Music, Unlink, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, Calendar, Shuffle, SlidersHorizontal, X, ListPlus } from 'lucide-react';
import { searchAudio, getRandomAudio, SearchResult, SearchFilters, SearchField } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';
import { useUmami } from '@/hooks/useUmami';
import RequestSourceDialog from '@/components/RequestSourceDialog';

const RESULTS_PER_PAGE = 50;

const SORT_OPTIONS = [
    { value: '', label: 'Relevance' },
    { value: 'name_asc', label: 'Name A→Z' },
    { value: 'name_desc', label: 'Name Z→A' },
    { value: 'date_desc', label: 'Newest first' },
    { value: 'date_asc', label: 'Oldest first' },
] as const;

const VALID_FIELDS: SearchField[] = ['filename', 'title', 'artist', 'description'];

function filtersFromParams(params: URLSearchParams): SearchFilters {
    const filters: SearchFilters = {};
    const type = params.get('type');
    if (type === 'audio' || type === 'folder') filters.type = type;
    if (params.get('unavailableOnly') === 'true') filters.unavailableOnly = true;
    const sort = params.get('sort');
    if (sort === 'name_asc' || sort === 'name_desc' || sort === 'date_asc' || sort === 'date_desc') filters.sort = sort;
    const dateFrom = params.get('dateFrom');
    if (dateFrom) filters.dateFrom = dateFrom;
    const dateTo = params.get('dateTo');
    if (dateTo) filters.dateTo = dateTo;
    const durationMin = params.get('durationMin');
    if (durationMin) filters.durationMin = parseFloat(durationMin);
    const durationMax = params.get('durationMax');
    if (durationMax) filters.durationMax = parseFloat(durationMax);
    const fieldsParam = params.get('fields');
    if (fieldsParam) {
        const parsed = fieldsParam.split(',').filter((f): f is SearchField => VALID_FIELDS.includes(f as SearchField));
        if (parsed.length > 0) filters.fields = parsed;
    }
    return filters;
}

function filtersToParams(filters: SearchFilters): Record<string, string> {
    const p: Record<string, string> = {};
    if (filters.type) p.type = filters.type;
    if (filters.unavailableOnly) p.unavailableOnly = 'true';
    if (filters.sort) p.sort = filters.sort;
    if (filters.dateFrom) p.dateFrom = filters.dateFrom;
    if (filters.dateTo) p.dateTo = filters.dateTo;
    if (filters.durationMin && filters.durationMin > 0) p.durationMin = filters.durationMin.toString();
    if (filters.durationMax && filters.durationMax > 0) p.durationMax = filters.durationMax.toString();
    if (filters.fields && filters.fields.length > 0) p.fields = filters.fields.join(',');
    return p;
}

function hasActiveFilters(filters: SearchFilters): boolean {
    return !!(filters.type || filters.unavailableOnly || filters.sort ||
        filters.dateFrom || filters.dateTo ||
        (filters.durationMin && filters.durationMin > 0) ||
        (filters.durationMax && filters.durationMax > 0) ||
        (filters.fields && filters.fields.length > 0));
}

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
    const [isLucky, setIsLucky] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showRequestDialog, setShowRequestDialog] = useState(false);
    const [filters, setFilters] = useState<SearchFilters>(() => filtersFromParams(searchParams));
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const totalPages = Math.ceil(total / RESULTS_PER_PAGE);

    const performSearch = useCallback(async (searchQuery: string, page: number = 1, activeFilters: SearchFilters = {}) => {
        if (searchQuery.length < 2 && !hasActiveFilters(activeFilters)) {
            setResults([]);
            setTotal(0);
            setHasSearched(false);
            return;
        }

        setIsLoading(true);
        const offset = (page - 1) * RESULTS_PER_PAGE;
        try {
            const response = await searchAudio(searchQuery, RESULTS_PER_PAGE, offset, activeFilters);
            setResults(response.results);
            setTotal(response.total);
            setHasSearched(true);
            if (page === 1) {
                track('search', { query: searchQuery, resultCount: response.total, ...activeFilters });
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
        const urlQuery = searchParams.get('q') ?? '';
        const urlPage = parseInt(searchParams.get('page') || '1', 10);
        const urlFilters = filtersFromParams(searchParams);

        if (urlQuery !== query) setQuery(urlQuery);
        setCurrentPage(urlPage);
        setFilters(urlFilters);

        if (urlQuery.length >= 2 || hasActiveFilters(urlFilters)) {
            performSearch(urlQuery, urlPage, urlFilters);
        }
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounce query input → URL update
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(() => {
            if (query.length >= 2 || (query.length === 0 && hasActiveFilters(filters))) {
                setCurrentPage(1);
                setSearchParams({ q: query, ...filtersToParams(filters) }, { replace: true });
            } else if (query.length === 0) {
                setSearchParams({}, { replace: true });
                setResults([]);
                setTotal(0);
                setHasSearched(false);
            }
        }, 500);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const applyFilters = (newFilters: SearchFilters) => {
        setFilters(newFilters);
        setCurrentPage(1);
        if (query.length >= 2 || hasActiveFilters(newFilters)) {
            setSearchParams({ q: query, ...filtersToParams(newFilters) }, { replace: true });
            performSearch(query, 1, newFilters);
        } else {
            setSearchParams({}, { replace: true });
            setResults([]);
            setTotal(0);
            setHasSearched(false);
        }
    };

    const clearFilters = () => applyFilters({});

    const handleLucky = async () => {
        setIsLucky(true);
        try {
            const shareKey = await getRandomAudio();
            track('feeling-lucky');
            navigate(`/share/${shareKey}`);
        } catch (error) {
            console.error('Failed to get random audio:', error);
        } finally {
            setIsLucky(false);
        }
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        setCurrentPage(newPage);
        setSearchParams({ q: query, page: newPage.toString(), ...filtersToParams(filters) }, { replace: true });
        performSearch(query, newPage, filters);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const getResultPath = (result: SearchResult): string => {
        if (result.type === 'audio') return `/share/${result.shareKey}`;
        const encodedPath = result.path.split('/').map(s => encodeURIComponent(s)).join('/');
        return `/browse/${encodedPath}`;
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

    const activeFilterCount = Object.values(filtersToParams(filters)).length;

    return (
        <>
            <Helmet>
                <title>Search - {DEFAULT_TITLE}</title>
                <meta name="description" content={`${DEFAULT_DESCRIPTION} — Search`} />
            </Helmet>

            <div className="max-w-4xl mx-auto animate-slideUp">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-4 flex items-center gap-3" style={{ fontFamily: 'var(--font-display)' }}>
                        <SearchIcon className="h-6 w-6 text-[var(--primary)] flex-shrink-0" />
                        Search Audio Library
                    </h1>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
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
                                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[var(--primary)]" />
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            title="Filters"
                            className={`relative flex items-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                                showFilters || activeFilterCount > 0
                                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                                    : 'bg-[var(--card)] border-[var(--border)] hover:bg-[var(--card-hover)] text-[var(--foreground)]'
                            }`}
                        >
                            <SlidersHorizontal className="h-5 w-5" />
                            <span className="hidden sm:inline">Filters</span>
                            {activeFilterCount > 0 && !showFilters && (
                                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-[var(--foreground)] text-[var(--background)] text-[10px] font-bold flex items-center justify-center">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={handleLucky}
                            disabled={isLucky}
                            title="I'm feeling lucky"
                            className="flex items-center gap-2 px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:bg-[var(--card-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[var(--foreground)] whitespace-nowrap"
                        >
                            {isLucky ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[var(--primary)]" />
                            ) : (
                                <Shuffle className="h-5 w-5 text-[var(--primary)]" />
                            )}
                            <span className="hidden sm:inline">I'm feeling lucky</span>
                        </button>
                    </div>

                    {query.length > 0 && query.length < 2 && !hasActiveFilters(filters) && (
                        <p className="text-sm text-[var(--muted-foreground)] mt-2">
                            Enter at least 2 characters to search
                        </p>
                    )}

                    <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${showFilters ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                        <div className="overflow-hidden">
                            <FilterPanel
                                filters={filters}
                                onChange={applyFilters}
                                onClear={clearFilters}
                            />
                        </div>
                    </div>
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
                            <Link
                                key={result.id}
                                to={getResultPath(result)}
                                onClick={() => track('search-result-click', { query, resultPath: result.path, resultType: result.type })}
                                className={`block border border-[var(--border)] rounded-lg p-4 transition-colors group no-underline ${
                                    result.type === 'audio' && result.unavailableAt
                                        ? 'bg-amber-500/5 hover:bg-amber-500/10'
                                        : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'
                                }`}
                                title={result.type === 'audio' && result.unavailableAt ? 'The original source of this audio is no longer available.' : undefined}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 mt-1">
                                        {result.type === 'folder' ? (
                                            <Folder className="h-5 w-5 text-[var(--primary)]" />
                                        ) : (
                                            <div className="relative">
                                                <Music className="h-5 w-5 text-[var(--primary)]" />
                                                {result.unavailableAt && (
                                                    <Unlink className="absolute -bottom-1 -right-1 h-3 w-3 text-amber-500" aria-label="Source unavailable" />
                                                )}
                                            </div>
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
                                            <span className="px-2 py-0.5 bg-[var(--secondary)] rounded">
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
                                            {result.modifiedAt && (
                                                <span className="flex items-center gap-1 flex-shrink-0">
                                                    <Calendar className="h-3 w-3" />
                                                    {formatDate(result.modifiedAt)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
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
                        <p className="text-[var(--muted-foreground)] mb-6">
                            Try searching with different keywords
                            {hasActiveFilters(filters) && (
                                <> or <button onClick={clearFilters} className="text-[var(--primary)] hover:underline">clear filters</button></>
                            )}
                        </p>
                        <button
                            onClick={() => {
                                setShowRequestDialog(true);
                                track('artist-request-dialog-open', { from: 'search-no-results', query });
                            }}
                            className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm font-medium"
                        >
                            <ListPlus className="h-4 w-4" />
                            Request a source
                        </button>
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
            <RequestSourceDialog isOpen={showRequestDialog} onCloseAction={() => setShowRequestDialog(false)} />
        </>
    );
}

// --- Filter panel ---

interface FilterPanelProps {
    filters: SearchFilters;
    onChange: (filters: SearchFilters) => void;
    onClear: () => void;
}

function FilterPanel({ filters, onChange, onClear }: FilterPanelProps) {
    const update = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
    const isActive = hasActiveFilters(filters);

    return (
        <div className="mt-3 p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                        Type
                    </label>
                    <div className="flex gap-1.5">
                        {(['', 'audio', 'folder'] as const).map((t) => (
                            <button
                                key={t || 'all'}
                                onClick={() => update({ type: t || undefined })}
                                className={`px-3 py-1.5 text-sm rounded border transition-all duration-150 ${
                                    (filters.type ?? '') === t
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                                        : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50 hover:text-[var(--foreground)]'
                                }`}
                            >
                                {t === '' ? 'All' : t === 'audio' ? 'Audio' : 'Folders'}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                        Sort by
                    </label>
                    <CustomSelect
                        value={filters.sort ?? ''}
                        onChange={(v) => update({ sort: v as SearchFilters['sort'] || undefined })}
                        options={SORT_OPTIONS as unknown as { value: string; label: string }[]}
                    />
                </div>
            </div>

            <div className="border-t border-[var(--border)]/50" />

            <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                    Search in
                </label>
                <div className="flex flex-wrap gap-1.5">
                    {VALID_FIELDS.map((f) => {
                        const active = filters.fields ? filters.fields.includes(f) : false;
                        const label = f === 'filename' ? 'Filename' : f === 'title' ? 'Title' : f === 'artist' ? 'Artist' : 'Description';
                        const toggle = () => {
                            const current = filters.fields && filters.fields.length > 0 ? filters.fields : [];
                            const next = current.includes(f)
                                ? current.filter(x => x !== f)
                                : [...current, f];
                            update({ fields: next.length === 0 || next.length === VALID_FIELDS.length ? undefined : next });
                        };
                        return (
                            <button
                                key={f}
                                onClick={toggle}
                                className={`px-3 py-1.5 text-sm rounded border transition-all duration-150 ${
                                    active
                                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                                        : 'bg-transparent border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50 hover:text-[var(--foreground)]'
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="border-t border-[var(--border)]/50" />

            <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-3 uppercase tracking-widest">
                    Duration
                </label>
                <DualRangeSlider
                    minVal={filters.durationMin ?? 0}
                    maxVal={filters.durationMax ?? 0}
                    onChange={(min, max) => update({ durationMin: min || undefined, durationMax: max || undefined })}
                />
            </div>

            <div className="border-t border-[var(--border)]/50" />

            <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                    Date added
                </label>
                <div className="flex items-center gap-2">
                    <DatePicker
                        value={filters.dateFrom ?? ''}
                        onChange={(v) => update({ dateFrom: v || undefined })}
                        placeholder="From"
                        alignRight={false}
                    />
                    <span className="text-[var(--border)] text-xs shrink-0">—</span>
                    <DatePicker
                        value={filters.dateTo ?? ''}
                        onChange={(v) => update({ dateTo: v || undefined })}
                        placeholder="To"
                        alignRight={true}
                    />
                </div>
            </div>

            <div className="border-t border-[var(--border)]/50" />

            <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                    <span className="relative inline-flex h-5 w-9 shrink-0">
                        <input
                            type="checkbox"
                            checked={filters.unavailableOnly ?? false}
                            onChange={(e) => update({ unavailableOnly: e.target.checked || undefined })}
                            className="peer sr-only"
                        />
                        <span className="absolute inset-0 rounded-full bg-[var(--secondary)] border border-[var(--border)] peer-checked:bg-amber-500/20 peer-checked:border-amber-500/50 transition-all duration-200" />
                        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-[var(--muted-foreground)] peer-checked:translate-x-4 peer-checked:bg-amber-400 transition-all duration-200 shadow-sm" />
                    </span>
                    <span className="text-sm text-[var(--muted-foreground)] group-hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5">
                        <Unlink className="h-3.5 w-3.5 text-amber-500" />
                        Source unavailable only
                    </span>
                </label>

                {isActive && (
                    <button
                        onClick={onClear}
                        className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-transparent hover:border-[var(--border)] rounded px-2 py-1 transition-all"
                    >
                        <X className="h-3 w-3" />
                        Clear all
                    </button>
                )}
            </div>
        </div>
    );
}

// --- Custom Select ---

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}

function CustomSelect({ value, onChange, options }: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                !dropdownRef.current?.contains(e.target as Node) &&
                !triggerRef.current?.contains(e.target as Node)
            ) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleOpen = () => {
        if (!open && triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            setPopoverStyle({ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 });
        }
        setOpen(v => !v);
    };

    const selected = options.find(o => o.value === value);

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                onClick={handleOpen}
                className={`w-full px-3 py-1.5 text-sm bg-[var(--secondary)] border rounded flex items-center justify-between gap-2 focus:outline-none transition-colors ${
                    open ? 'border-[var(--primary)]' : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                } text-[var(--foreground)]`}
            >
                <span>{selected?.label ?? ''}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && createPortal(
                <div
                    ref={dropdownRef}
                    style={popoverStyle}
                    className="bg-[var(--card)] border border-[var(--border)] rounded shadow-lg overflow-hidden animate-fadeIn"
                >
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                                opt.value === value
                                    ? 'text-[var(--primary)] bg-[var(--primary)]/10'
                                    : 'text-[var(--foreground)] hover:bg-[var(--card-hover)]'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}

// --- Custom Date Picker ---

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatDateDisplay(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}`;
}

function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DatePickerProps {
    value: string; // ISO date (YYYY-MM-DD) or ''
    onChange: (value: string) => void;
    placeholder: string;
    alignRight: boolean;
}

function DatePicker({ value, onChange, placeholder, alignRight }: DatePickerProps) {
    const today = todayISO();
    const initialYear = value ? parseInt(value.split('-')[0]) : new Date().getFullYear();
    const initialMonth = value ? parseInt(value.split('-')[1]) - 1 : new Date().getMonth();

    const [open, setOpen] = useState(false);
    const [view, setView] = useState<'days' | 'months'>('days');
    const [viewYear, setViewYear] = useState(initialYear);
    const [viewMonth, setViewMonth] = useState(initialMonth);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value) {
            setViewYear(parseInt(value.split('-')[0]));
            setViewMonth(parseInt(value.split('-')[1]) - 1);
        }
    }, [value]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                !calendarRef.current?.contains(e.target as Node) &&
                !triggerRef.current?.contains(e.target as Node)
            ) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const openPicker = () => {
        if (!open && triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            setPopoverStyle({
                position: 'fixed',
                top: r.bottom + 4,
                ...(alignRight ? { right: window.innerWidth - r.right } : { left: r.left }),
                width: 256,
                zIndex: 9999,
            });
        }
        setView('days');
        setOpen(v => !v);
    };

    const prevPeriod = () => {
        if (view === 'months') {
            setViewYear(y => y - 1);
        } else if (viewMonth === 0) {
            setViewMonth(11); setViewYear(y => y - 1);
        } else {
            setViewMonth(m => m - 1);
        }
    };

    const nextPeriod = () => {
        if (view === 'months') {
            setViewYear(y => y + 1);
        } else if (viewMonth === 11) {
            setViewMonth(0); setViewYear(y => y + 1);
        } else {
            setViewMonth(m => m + 1);
        }
    };

    const selectMonth = (month: number) => {
        setViewMonth(month);
        setView('days');
    };

    const selectDay = (day: number) => {
        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        onChange(iso);
        setOpen(false);
    };

    const clearDate = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
    };

    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [
        ...Array(firstDayOfWeek).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const selectedMonth = value && parseInt(value.split('-')[0]) === viewYear
        ? parseInt(value.split('-')[1]) - 1
        : -1;

    return (
        <div className="relative flex-1">
            <button
                ref={triggerRef}
                onClick={openPicker}
                className={`w-full px-3 py-1.5 text-sm bg-[var(--secondary)] border rounded flex items-center justify-between gap-2 focus:outline-none transition-colors ${
                    open ? 'border-[var(--primary)]' : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                }`}
            >
                <span className={`flex items-center gap-1.5 min-w-0 ${value ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{value ? formatDateDisplay(value) : placeholder}</span>
                </span>
                {value ? (
                    <span onClick={clearDate} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors shrink-0">
                        <X className="h-3 w-3" />
                    </span>
                ) : (
                    <ChevronDown className={`h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                )}
            </button>

            {open && createPortal(
                <div ref={calendarRef} style={popoverStyle} className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl p-3 animate-fadeIn">
                    <div className="flex items-center justify-between mb-3">
                        <button
                            onClick={prevPeriod}
                            className="p-1 rounded hover:bg-[var(--card-hover)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setView(v => v === 'days' ? 'months' : 'days')}
                            className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] px-2 py-0.5 rounded hover:bg-[var(--card-hover)] transition-colors"
                        >
                            {view === 'days' ? `${MONTH_NAMES[viewMonth]} ${viewYear}` : viewYear}
                        </button>
                        <button
                            onClick={nextPeriod}
                            className="p-1 rounded hover:bg-[var(--card-hover)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>

                    {view === 'months' ? (
                        <div className="grid grid-cols-3 gap-1">
                            {MONTH_NAMES.map((name, i) => (
                                <button
                                    key={name}
                                    onClick={() => selectMonth(i)}
                                    className={`py-2 text-sm rounded transition-colors ${
                                        i === selectedMonth
                                            ? 'bg-[var(--primary)] text-white font-medium'
                                            : i === viewMonth
                                            ? 'bg-[var(--primary)]/20 text-[var(--primary)] font-medium hover:bg-[var(--primary)]/30'
                                            : 'text-[var(--foreground)] hover:bg-[var(--card-hover)]'
                                    }`}
                                >
                                    {name.slice(0, 3)}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-7 mb-1">
                                {DAY_LABELS.map(d => (
                                    <div key={d} className="text-center text-[10px] font-semibold text-[var(--muted-foreground)] py-1 uppercase tracking-wide">
                                        {d}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-y-0.5">
                                {cells.map((day, i) => {
                                    if (day === null) return <div key={`e-${i}`} />;

                                    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const isSelected = value === iso;
                                    const isToday = today === iso;

                                    return (
                                        <button
                                            key={day}
                                            onClick={() => selectDay(day)}
                                            className={`text-xs rounded py-1 transition-colors ${
                                                isSelected
                                                    ? 'bg-[var(--primary)] text-white font-medium'
                                                    : isToday
                                                    ? 'bg-[var(--primary)]/20 text-[var(--primary)] font-medium hover:bg-[var(--primary)]/30'
                                                    : 'text-[var(--foreground)] hover:bg-[var(--card-hover)]'
                                            }`}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

// --- Dual range slider ---
const MAX_MINUTES = 240;
const INF_POS = MAX_MINUTES + 1;

function posToSeconds(pos: number): number {
    if (pos <= 0 || pos >= INF_POS) return 0;
    return pos * 60;
}

function secondsToPos(s: number): number {
    if (s <= 0) return 0;
    return Math.min(Math.round(s / 60), MAX_MINUTES);
}

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
}

interface DualRangeSliderProps {
    minVal: number; // seconds; 0 = no min
    maxVal: number; // seconds; 0 = no max
    onChange: (min: number, max: number) => void;
}

function DualRangeSlider({ minVal, maxVal, onChange }: DualRangeSliderProps) {
    const [localMinPos, setLocalMinPos] = useState(() => secondsToPos(minVal));
    const [localMaxPos, setLocalMaxPos] = useState(() => maxVal === 0 ? INF_POS : secondsToPos(maxVal));

    useEffect(() => {
        setLocalMinPos(secondsToPos(minVal));
        setLocalMaxPos(maxVal === 0 ? INF_POS : secondsToPos(maxVal));
    }, [minVal, maxVal]);

    const commit = (minPos: number, maxPos: number) => {
        onChange(posToSeconds(minPos), posToSeconds(maxPos));
    };

    const displayMin = posToSeconds(localMinPos);
    const displayMax = posToSeconds(localMaxPos);
    const fillLeft = (localMinPos / INF_POS) * 100;
    const fillRight = (localMaxPos / INF_POS) * 100;

    const thumbCls = [
        'absolute w-full !h-full appearance-none !bg-transparent pointer-events-none',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto',
        '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-2',
        '[&::-webkit-slider-thumb]:bg-[var(--primary)] [&::-webkit-slider-thumb]:cursor-pointer',
        '[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--card),0_0_0_3px_var(--primary)]',
        '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
        '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--primary)] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer',
        '[&::-moz-range-thumb]:shadow-[0_0_0_2px_var(--card),0_0_0_3px_var(--primary)]',
        '[&::-webkit-slider-runnable-track]:!bg-transparent [&::-webkit-slider-runnable-track]:!h-0',
        '[&::-moz-range-track]:!bg-transparent [&::-moz-range-track]:!h-0 [&::-moz-range-track]:!border-0',
    ].join(' ');

    return (
        <div className="px-1">
            <div className="flex justify-between text-sm text-[var(--muted-foreground)] mb-3">
                <span className={displayMin > 0 ? 'text-[var(--foreground)] font-medium' : ''}>
                    {displayMin > 0 ? `≥ ${formatDuration(displayMin)}` : 'Any'}
                </span>
                <span className={localMaxPos < INF_POS ? 'text-[var(--foreground)] font-medium' : ''}>
                    {localMaxPos < INF_POS ? `≤ ${formatDuration(displayMax)}` : '∞'}
                </span>
            </div>
            <div className="relative h-5 flex items-center">
                <div className="absolute w-full h-1.5 rounded-full bg-[var(--secondary)] pointer-events-none" style={{ zIndex: 1 }}>
                    <div
                        className="absolute h-full rounded-full bg-[var(--primary)]"
                        style={{ left: `${fillLeft}%`, right: `${100 - fillRight}%` }}
                    />
                </div>
                <input
                    type="range"
                    min={0}
                    max={INF_POS}
                    value={localMinPos}
                    onChange={(e) => {
                        const pos = parseInt(e.target.value);
                        if (pos < localMaxPos) setLocalMinPos(pos);
                    }}
                    onMouseUp={() => commit(localMinPos, localMaxPos)}
                    onTouchEnd={() => commit(localMinPos, localMaxPos)}
                    className={thumbCls}
                    style={{ zIndex: localMinPos >= INF_POS - 1 ? 4 : 2 }}
                />
                <input
                    type="range"
                    min={0}
                    max={INF_POS}
                    value={localMaxPos}
                    onChange={(e) => {
                        const pos = parseInt(e.target.value);
                        if (pos > localMinPos) setLocalMaxPos(pos);
                    }}
                    onMouseUp={() => commit(localMinPos, localMaxPos)}
                    onTouchEnd={() => commit(localMinPos, localMaxPos)}
                    className={thumbCls}
                    style={{ zIndex: 3 }}
                />
            </div>
        </div>
    );
}
