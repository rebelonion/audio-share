import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import SectionCard from '@/components/ui/SectionCard';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { AudioChart, UnavailableChart, SourcesChart, DurationChart, PublicationYearChart, SourceAvailabilityChart, type UnavailableByDayData } from '@/components/StatsCharts';
import { API_BASE } from '@/lib/api';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';
import { appFetch } from '@/lib/cloudflareChallenge';

interface DayData {
    date: string;
    count: number;
}

interface AudioByDayData {
    total: number;
    days: DayData[];
}

interface SourceDayData {
    date: string;
    count: number;
    sources: { name: string; path: string }[];
}

interface SourcesByDayData {
    total: number;
    days: SourceDayData[];
}

interface SummaryStats {
    totalFiles: number;
    totalSources: number;
    totalDuration: number;
    totalStorage: number;
    totalUnavailable: number;
}

interface DurationBucket {
    label: string;
    count: number;
}

interface DurationStatsData {
    buckets: DurationBucket[];
}

interface YearStat {
    year: string;
    count: number;
}

interface PublicationYearData {
    years: YearStat[];
}

interface SourceAvailabilityPoint {
    name: string;
    path: string;
    total: number;
    unavailable: number;
    ratio: number;
}

interface SourceAvailabilityData {
    sources: SourceAvailabilityPoint[];
}

function formatDuration(seconds: number): string {
    const h = seconds / 3600;
    const days = h / 24;
    const years = days / 365;
    if (years >= 1) return `${years.toFixed(1)} yrs`;
    if (days >= 1) return `${days.toFixed(1)} days`;
    const hWhole = Math.floor(h);
    const m = Math.floor((seconds % 3600) / 60);
    if (hWhole > 0) return `${hWhole.toLocaleString()} hrs ${m}m`;
    return `${m}m`;
}

function formatStorage(bytes: number): string {
    if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(1)} KB`;
}

export default function Stats() {
    const [audioData, setAudioData] = useState<AudioByDayData | null>(null);
    const [unavailableData, setUnavailableData] = useState<UnavailableByDayData | null>(null);
    const [sourcesData, setSourcesData] = useState<SourcesByDayData | null>(null);
    const [summary, setSummary] = useState<SummaryStats | null>(null);
    const [durationData, setDurationData] = useState<DurationStatsData | null>(null);
    const [publicationYearData, setPublicationYearData] = useState<PublicationYearData | null>(null);
    const [sourceAvailabilityData, setSourceAvailabilityData] = useState<SourceAvailabilityData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(false);
        async function fetchStats() {
            try {
                const response = await appFetch(`${API_BASE}/api/stats`, {signal: controller.signal});
                if (!response.ok) throw new Error(`Statistics request failed: ${response.status}`);
                const data = await response.json();
                if (controller.signal.aborted) return;
                setAudioData(data.audio);
                setUnavailableData(data.unavailable);
                setSourcesData(data.sources);
                setSummary(data.summary);
                setDurationData(data.durations);
                setPublicationYearData(data.publicationYears);
                setSourceAvailabilityData(data.sourceAvailability);
            } catch (err) {
                if (controller.signal.aborted) return;
                console.error('Failed to load stats:', err);
                setError(true);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void fetchStats();
        return () => controller.abort();
    }, [retry]);

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="h-10 skeleton rounded w-48 mb-8"></div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-12">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-[var(--card)] rounded-lg p-4 sm:p-6 shadow-lg">
                            <div className="h-4 skeleton rounded w-24 mb-3"></div>
                            <div className="h-8 skeleton rounded w-32"></div>
                        </div>
                    ))}
                </div>
                <div className="bg-[var(--card)] rounded-lg p-6 mb-12">
                    <div className="h-8 skeleton rounded w-64 mb-4"></div>
                    <div className="h-[450px] skeleton rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>{DEFAULT_TITLE} - Stats</title>
                <meta name="description" content={`${DEFAULT_DESCRIPTION} · Stats`} />
            </Helmet>
            <div className="max-w-7xl mx-auto animate-slideUp">
                <h1 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-8 text-[var(--foreground)]" style={{ fontFamily: 'var(--font-display)' }}>Statistics</h1>

                {error ? <ErrorState title="Statistics could not be loaded" onRetry={() => setRetry(value => value + 1)}>
                    Please try again.
                </ErrorState> : <>
                    {summary && (
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-8 sm:mb-12">
                            {[
                                { label: 'Total Files', value: summary.totalFiles.toLocaleString() },
                                { label: 'Total Sources', value: summary.totalSources.toLocaleString() },
                                { label: 'Total Duration', value: formatDuration(summary.totalDuration) },
                                { label: 'Storage Used', value: formatStorage(summary.totalStorage) },
                                { label: 'Unavailable', value: summary.totalUnavailable.toLocaleString() },
                            ].map(({ label, value }) => (
                                <div key={label} className="bg-[var(--card)] rounded-lg p-4 sm:p-6 shadow-lg">
                                    <p className="text-xs sm:text-sm text-[var(--muted-foreground)] mb-1">{label}</p>
                                    <p className="text-2xl sm:text-3xl font-bold text-[var(--primary)]" style={{ fontFamily: 'var(--font-display)' }}>{value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    <SectionCard title="Audio Files by Day">
                        {audioData ? <AudioChart data={audioData} /> : <EmptyState title="No audio data available." compact />}
                    </SectionCard>
                    {unavailableData && unavailableData.days.length > 0 && <SectionCard title="Unavailable Audio by Day"
                        description="When currently unavailable audio was marked as no longer available at its original source.">
                        <UnavailableChart data={unavailableData} />
                    </SectionCard>}
                    {durationData && durationData.buckets.length > 0 && <SectionCard title="Track Length Distribution">
                        <DurationChart data={durationData} />
                    </SectionCard>}
                    {publicationYearData && publicationYearData.years.length > 0 && <SectionCard title="Files by Publication Year">
                        <PublicationYearChart data={publicationYearData} />
                    </SectionCard>}
                    {sourceAvailabilityData && sourceAvailabilityData.sources.length > 0 && <SectionCard title="Source Availability">
                        <SourceAvailabilityChart data={sourceAvailabilityData} />
                    </SectionCard>}
                    <SectionCard title="Sources by Day">
                        {sourcesData ? <SourcesChart data={sourcesData} /> : <EmptyState title="No data available." compact />}
                    </SectionCard>
                </>}
            </div>
        </>
    );
}
