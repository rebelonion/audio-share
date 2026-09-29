import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import DatePicker from '@/components/ui/DatePicker';
import {Button, IconButton} from '@/components/ui/Button';
import Disclosure from '@/components/ui/Disclosure';
import useDisclosure from '@/components/ui/useDisclosure';
import SelectionGroup from '@/components/ui/SelectionGroup';
import Switch from '@/components/ui/Switch';
import Pagination from '@/components/ui/Pagination';
import DurationRange from '@/components/DurationRange';
import Alert from '@/components/ui/Alert';
import SearchBar from '@/components/SearchBar';
import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { Search as SearchIcon, Folder, Music, Play, ShieldAlert, Unlink, ArrowRight, Calendar, Shuffle, SlidersHorizontal, X, ListPlus } from 'lucide-react';
import { searchAudio, getRandomAudio, getRandomAudioFromSearch, fetchDirectoryContents, SearchResult, SearchFilters, SearchField, isMatureAge } from '@/lib/api';
import type { Folder as RootFolder } from '@/types';
import { formatDate } from '@/lib/utils';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';
import { useRybbit } from '@/hooks/useRybbit';
import { useMatureContentPreference } from '@/hooks/useMatureContentPreference';
import RequestSourceDialog from '@/components/RequestSourceDialog';
import CustomSelect from '@/components/CustomSelect';
import TrackQuickActions from '@/components/TrackQuickActions';
import {useAudioPlayerCommands, type AudioPlayerTrack} from '@/contexts/AudioPlayerContext';

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
    const root = params.get('root');
    if (root) filters.root = root;
    if (params.get('includeMature') === 'true') filters.includeMature = true;
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
    if (filters.root) p.root = filters.root;
    if (filters.includeMature) p.includeMature = 'true';
    return p;
}

function hasActiveFilters(filters: SearchFilters): boolean {
    return !!(filters.type || filters.unavailableOnly || filters.sort ||
        filters.dateFrom || filters.dateTo ||
        (filters.durationMin && filters.durationMin > 0) ||
        (filters.durationMax && filters.durationMax > 0) ||
        (filters.fields && filters.fields.length > 0) ||
        filters.root ||
        filters.includeMature);
}

export default function Search() {
    const { track } = useRybbit();
    const {playTrack} = useAudioPlayerCommands();
    const maturePreference = useMatureContentPreference();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams({});
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [isLucky, setIsLucky] = useState(false);
    const filterDisclosure = useDisclosure();
    const showFilters = filterDisclosure.open;
    const [showRequestDialog, setShowRequestDialog] = useState(false);
    const [filters, setFilters] = useState<SearchFilters>(() => filtersFromParams(searchParams));
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const resultScopeRef = useRef('');

    const totalPages = Math.ceil(total / RESULTS_PER_PAGE);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setQuery(searchParams.get('q') ?? '');
        const page = Number(searchParams.get('page') || '1');
        setCurrentPage(Number.isSafeInteger(page) && page > 0 ? page : 1);
        setFilters(filtersFromParams(searchParams));
    }, [searchParams]);

    useEffect(() => {
        const controller = new AbortController();
        const urlQuery = searchParams.get('q') ?? '';
        const activeFilters = filtersFromParams(searchParams);
        const rawPage = Number(searchParams.get('page') || '1');
        const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
        const scope = JSON.stringify([urlQuery, activeFilters]);
        setResults([]);
        if (resultScopeRef.current !== scope || query !== urlQuery) setTotal(0);
        resultScopeRef.current = scope;
        setHasSearched(false);
        setSearchError(false);
        setIsLoading(false);
        if (query !== urlQuery || (urlQuery.length < 2 && !hasActiveFilters(activeFilters))) return;

        setIsLoading(true);
        searchAudio(urlQuery, RESULTS_PER_PAGE, (page - 1) * RESULTS_PER_PAGE, activeFilters, controller.signal)
            .then(response => {
                if (controller.signal.aborted) return;
                setResults(response.results);
                setTotal(response.total);
                setHasSearched(true);
                if (page === 1) track('search', {query: urlQuery, resultCount: response.total, ...activeFilters});
            }).catch(() => {
                if (!controller.signal.aborted) setSearchError(true);
            }).finally(() => {
                if (!controller.signal.aborted) setIsLoading(false);
            });
        return () => controller.abort();
    }, [searchParams, query, retry, track]);

    useEffect(() => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
    }, []);

    const changeQuery = (value: string) => {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setSearchParams({q: value, ...filtersToParams(filters)}, {replace: true});
        }, 500);
    };

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const applyFilters = (newFilters: SearchFilters) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setFilters(newFilters);
        setCurrentPage(1);
        if (query.length >= 2 || hasActiveFilters(newFilters)) {
            setSearchParams({ q: query, ...filtersToParams(newFilters) }, { replace: true });
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
            const searchShareKey = query.length >= 2
                ? await getRandomAudioFromSearch(query, filters)
                : null;
            const shareKey = searchShareKey ?? await getRandomAudio();
            track('feeling-lucky', { query: query || undefined, matchedSearch: !!searchShareKey });
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const getResultPath = (result: SearchResult): string => {
        if (result.type === 'audio') return `/share/${result.shareKey}`;
        const encodedPath = result.path.split('/').map(s => encodeURIComponent(s)).join('/');
        return `/browse/${encodedPath}`;
    };

    const getParentLink = (result: SearchResult): string | null => {
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
                <meta name="description" content={`${DEFAULT_DESCRIPTION} · Search`} />
            </Helmet>

            <div className="max-w-4xl mx-auto animate-slideUp">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-4 flex items-center gap-3" style={{ fontFamily: 'var(--font-display)' }}>
                        <SearchIcon className="h-6 w-6 text-[var(--primary)] flex-shrink-0" />
                        Search Audio Library
                    </h1>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <SearchBar ref={inputRef} value={query} onChange={changeQuery} loading={isLoading} size="lg" label="Search audio library" placeholder="Search by name, artist, title, or description..." />
                        </div>
                        <Button
                            {...filterDisclosure.triggerProps}
                            variant={showFilters || activeFilterCount > 0 ? 'selected' : 'secondary'}
                            size="lg" title="Filters" aria-label="Filters" className="relative"
                        >
                            <SlidersHorizontal className="h-5 w-5" />
                            <span className="hidden sm:inline">Filters</span>
                            {activeFilterCount > 0 && !showFilters && (
                                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-[var(--foreground)] text-[var(--background)] text-[10px] font-bold flex items-center justify-center">
                                    {activeFilterCount}
                                </span>
                            )}
                        </Button>
                        <Button variant="secondary" size="lg"
                            onClick={handleLucky}
                            disabled={isLucky}
                            title="I'm feeling lucky" aria-label="I'm feeling lucky"
                            className="whitespace-nowrap"
                        >
                            {isLucky ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[var(--primary)]" />
                            ) : (
                                <Shuffle className="h-5 w-5 text-[var(--primary)]" />
                            )}
                            <span className="hidden sm:inline">I'm feeling lucky</span>
                        </Button>
                    </div>

                    {query.length > 0 && query.length < 2 && !hasActiveFilters(filters) && (
                        <p className="text-sm text-[var(--muted-foreground)] mt-2">
                            Enter at least 2 characters to search
                        </p>
                    )}

                    <Disclosure {...filterDisclosure.panelProps}>
                        <FilterPanel filters={filters} onChange={applyFilters} onClear={clearFilters} />
                    </Disclosure>
                </div>

                {searchError && (
                    <Alert className="mb-4">
                        <p>Search could not be loaded. Please try again.</p>
                        <Button variant="link" onClick={() => setRetry(value => value + 1)} className="mt-2">Retry search</Button>
                    </Alert>
                )}

                {hasSearched && (
                    <div className="mb-4 text-[var(--muted-foreground)]">
                        <span>{`Found ${total} result${total !== 1 ? 's' : ''} for "${query}"`}</span>
                        {totalPages > 1 && (
                            <span> (page {currentPage} of {totalPages})</span>
                        )}
                    </div>
                )}

                {results.length > 0 && (
                    <div className="space-y-2">
                        {results.map((result) => {
                            const playerTrack: AudioPlayerTrack | null = result.type === 'audio' && result.shareKey ? {
                                src: `/audio/key/${result.shareKey}`,
                                shareKey: result.shareKey,
                                name: result.title || result.name,
                                artist: result.artist,
                                ageLimit: result.ageLimit,
                                source: 'search',
                            } : null;
                            return (
                                <div
                                    key={`${result.type}:${result.id}`}
                                    className={`flex flex-col gap-3 border border-[var(--border)] rounded-lg p-4 transition-colors group sm:flex-row sm:items-start ${
                                        result.type === 'audio' && (result.unavailableAt || result.removalRequestedAt)
                                            ? 'bg-amber-500/5 hover:bg-amber-500/10'
                                            : 'bg-[var(--card)] hover:bg-[var(--card-hover)]'
                                    }`}
                                    title={result.type === 'audio' && result.removalRequestedAt
                                        ? 'A removal request has been received. This item is only visible on the local network.'
                                        : result.type === 'audio' && result.unavailableAt
                                            ? 'The original source of this audio is no longer available.'
                                            : undefined}
                                >
                                    <div className="flex-1 min-w-0">
                                        <Link
                                            to={getResultPath(result)}
                                            onClick={() => track('search-result-click', { query, resultPath: result.path, resultType: result.type })}
                                            className="flex items-start gap-3 min-w-0 no-underline"
                                        >
                                            <div className="flex-shrink-0 mt-1">
                                                {result.type === 'folder' ? (
                                                    <Folder className="h-5 w-5 text-[var(--primary)]" />
                                                ) : (
                                                    <div className="relative">
                                                        <Music className="h-5 w-5 text-[var(--primary)]" />
                                                        {result.removalRequestedAt ? (
                                                            <ShieldAlert className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-amber-500" aria-label="Removal requested" />
                                                        ) : result.unavailableAt ? (
                                                            <Unlink className="absolute -bottom-1 -right-1 h-3 w-3 text-amber-500" aria-label="Source unavailable" />
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-grow min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-medium text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
                                                        {result.title || result.name}
                                                    </h3>
                                                    {result.type === 'audio' && isMatureAge(result.ageLimit) && (
                                                        <Badge size="sm">
                                                            18+
                                                        </Badge>
                                                    )}
                                                    {result.removalRequestedAt && (
                                                        <Badge size="sm">
                                                            Removal requested
                                                        </Badge>
                                                    )}
                                                    <ArrowRight className="h-4 w-4 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                                </div>

                                                {result.artist && (
                                                    <p className="text-sm text-[var(--muted-foreground)] truncate">
                                                        {result.artist}
                                                    </p>
                                                )}

                                                {result.description && (!isMatureAge(result.ageLimit) || maturePreference.enabled) && (
                                                    <p className="text-sm text-[var(--muted-foreground)] line-clamp-2 mt-1">
                                                        {result.description}
                                                    </p>
                                                )}
                                            </div>
                                        </Link>

                                        <div className="flex items-center gap-2 mt-2 ml-8 text-xs text-[var(--muted-foreground)]">
                                            <span className="px-2 py-0.5 bg-[var(--secondary)] rounded">
                                                {result.type}
                                            </span>
                                            {result.modifiedAt && (
                                                <span className="flex items-center gap-1 flex-shrink-0">
                                                    <Calendar className="h-3 w-3" />
                                                    {formatDate(result.modifiedAt)}
                                                </span>
                                            )}
                                            {result.parentPath && (
                                                <Link
                                                    to={getParentLink(result) || '/browse'}
                                                    className="hidden min-w-0 max-w-32 truncate text-[var(--primary)] hover:underline sm:inline-block"
                                                    title={`Browse ${getParentName(result)}`}
                                                >
                                                    in {getParentName(result)}
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                    {(result.parentPath || playerTrack) && (
                                        <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:contents">
                                            {result.parentPath && (
                                                <Link
                                                    to={getParentLink(result) || '/browse'}
                                                    className="min-w-0 flex-1 truncate text-xs text-[var(--primary)] hover:underline sm:hidden"
                                                    title={`Browse ${getParentName(result)}`}
                                                >
                                                    in {getParentName(result)}
                                                </Link>
                                            )}
                                            {playerTrack && (
                                                <div className="ml-auto flex shrink-0 items-center gap-1">
                                                    <TrackQuickActions track={playerTrack} />
                                                    <IconButton variant="primary"
                                                        type="button"
                                                        onClick={() => {
                                                            playTrack(playerTrack);
                                                            track('search-result-play', {
                                                                query,
                                                                resultPath: result.path,
                                                                title: result.title || result.name,
                                                            });
                                                        }}
                                                        title="Play"
                                                        aria-label={`Play ${result.title || result.name}`}
                                                    >
                                                        <Play className="h-4 w-4 fill-current" />
                                                    </IconButton>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {totalPages > 1 && <Pagination page={currentPage} pages={totalPages}
                    onPage={handlePageChange} disabled={isLoading} numbered className="mt-8" />}

                {hasSearched && results.length === 0 && !isLoading && (
                    <EmptyState title="No results found" icon={Music} action={
                        <Button onClick={() => {
                            setShowRequestDialog(true);
                            track('artist-request-dialog-open', { from: 'search-no-results', query });
                        }}><ListPlus className="h-4 w-4" /> Request a source</Button>
                    }>
                        Try searching with different keywords
                        {hasActiveFilters(filters) && <> or <Button variant="link" onClick={clearFilters}>clear filters</Button></>}
                    </EmptyState>
                )}

                {!hasSearched && !isLoading && !searchError && (
                    <EmptyState title="Search the entire library" icon={SearchIcon}>
                        Find audio files and folders by name, artist, title, or description
                    </EmptyState>
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
    const [roots, setRoots] = useState<RootFolder[]>([]);

    useEffect(() => {
        let cancelled = false;

        fetchDirectoryContents()
            .then((contents) => {
                if (!cancelled) {
                    setRoots(contents.items.filter((item): item is RootFolder => item.type === 'folder'));
                }
            })
            .catch((error) => {
                console.error('Failed to load root directories:', error);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="mt-3 p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                        Type
                    </label>
                    <SelectionGroup label="Type"
                        options={(['', 'audio', 'folder'] as const).map(value => ({
                            value, label: value === '' ? 'All' : value === 'audio' ? 'Audio' : 'Folders',
                            selected: (filters.type ?? '') === value,
                        }))}
                        onSelect={value => update({type: value || undefined})} />
                </div>

                <div>
                    <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                        Sort by
                    </label>
                    <CustomSelect
                        ariaLabel="Sort by"
                        value={filters.sort ?? ''}
                        onChange={(v) => update({ sort: v as SearchFilters['sort'] || undefined })}
                        options={SORT_OPTIONS as unknown as { value: string; label: string }[]}
                    />
                </div>
            </div>

            {roots.length > 0 && (
                <>
                    <div className="border-t border-[var(--border-subtle)]" />

                    <div>
                        <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                            Root directory
                        </label>
                        <CustomSelect
                            ariaLabel="Root directory"
                            value={filters.root ?? ''}
                            onChange={(v) => update({ root: v || undefined })}
                            options={[
                                { value: '', label: 'All roots' },
                                ...roots.map((root) => ({ value: root.path, label: root.name })),
                            ]}
                        />
                    </div>
                </>
            )}

            <div className="border-t border-[var(--border-subtle)]" />

            <Switch checked={!!filters.includeMature} onChange={checked => update({includeMature: checked || undefined})}>
                <Badge size="sm">18+</Badge>
                Include mature content
            </Switch>

            <div className="border-t border-[var(--border-subtle)]" />

            <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                    Search in
                </label>
                <SelectionGroup label="Search in"
                    options={VALID_FIELDS.map(value => ({value,
                        label: value === 'filename' ? 'Filename' : value === 'title' ? 'Title' : value === 'artist' ? 'Artist' : 'Description',
                        selected: filters.fields?.includes(value) ?? false,
                    }))}
                    onSelect={value => {
                        const current = filters.fields ?? [];
                        const next = current.includes(value) ? current.filter(field => field !== value) : [...current, value];
                        update({fields: next.length === 0 || next.length === VALID_FIELDS.length ? undefined : next});
                    }} />
            </div>

            <div className="border-t border-[var(--border-subtle)]" />

            <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-3 uppercase tracking-widest">
                    Duration
                </label>
                <DurationRange
                    minVal={filters.durationMin ?? 0}
                    maxVal={filters.durationMax ?? 0}
                    onChange={(min, max) => update({ durationMin: min || undefined, durationMax: max || undefined })}
                />
            </div>

            <div className="border-t border-[var(--border-subtle)]" />

            <div>
                <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] mb-2 uppercase tracking-widest">
                    Date added
                </label>
                <div className="flex items-center gap-2">
                    <DatePicker
                        value={filters.dateFrom ?? ''}
                        onChange={(v) => update({ dateFrom: v || undefined })}
                        placeholder="From"
                    />
                    <span className="text-[var(--border)] text-xs shrink-0">—</span>
                    <DatePicker
                        value={filters.dateTo ?? ''}
                        onChange={(v) => update({ dateTo: v || undefined })}
                        placeholder="To"
                    />
                </div>
            </div>

            <div className="border-t border-[var(--border-subtle)]" />

            <div className="flex items-center justify-between">
                <Switch checked={filters.unavailableOnly ?? false} onChange={checked => update({unavailableOnly: checked || undefined})}>
                    <Unlink className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                    Source unavailable only
                </Switch>

                {isActive && (
                    <Button variant="ghost" size="sm"
                        onClick={onClear}
                    >
                        <X className="h-3 w-3" />
                        Clear all
                    </Button>
                )}
            </div>
        </div>
    );
}
