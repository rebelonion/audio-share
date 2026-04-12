import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { AudioChart, SourcesChart } from '@/components/StatsCharts';
import { API_BASE } from '@/lib/api';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';

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
    const [sourcesData, setSourcesData] = useState<SourcesByDayData | null>(null);
    const [summary, setSummary] = useState<SummaryStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const response = await fetch(`${API_BASE}/api/stats`);
                if (response.ok) {
                    const data = await response.json();
                    setAudioData(data.audio);
                    setSourcesData(data.sources);
                    setSummary(data.summary);
                }
            } catch (err) {
                console.error('Failed to load stats:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, []);

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
                <meta name="description" content={`${DEFAULT_DESCRIPTION} — Stats`} />
            </Helmet>
            <div className="max-w-7xl mx-auto animate-slideUp">
                <h1 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-8 text-[var(--foreground)]" style={{ fontFamily: 'var(--font-display)' }}>Statistics</h1>

                {summary && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-12">
                        {[
                            { label: 'Total Files', value: summary.totalFiles.toLocaleString() },
                            { label: 'Total Sources', value: summary.totalSources.toLocaleString() },
                            { label: 'Total Duration', value: formatDuration(summary.totalDuration) },
                            { label: 'Storage Used', value: formatStorage(summary.totalStorage) },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-[var(--card)] rounded-lg p-4 sm:p-6 shadow-lg">
                                <p className="text-xs sm:text-sm text-[var(--muted-foreground)] mb-1">{label}</p>
                                <p className="text-2xl sm:text-3xl font-bold text-[var(--primary)]" style={{ fontFamily: 'var(--font-display)' }}>{value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Audio by Day Section */}
                <section className="mb-8 sm:mb-12">
                    <div className="bg-[var(--card)] rounded-lg p-4 sm:p-6 shadow-lg">
                        <h2 className="flex items-center gap-3 text-xl sm:text-2xl font-bold mb-4 text-[var(--foreground)]" style={{ fontFamily: 'var(--font-display)' }}>
                            <span className="inline-block w-1 h-5 sm:h-6 bg-[var(--primary)] rounded-sm flex-shrink-0" style={{ opacity: 0.85 }} />
                            Audio Files by Day
                        </h2>
                        {audioData ? (
                            <AudioChart data={audioData} />
                        ) : (
                            <p className="text-[var(--muted-foreground)]">
                                No data available. Please create <code className="bg-[var(--background)] px-2 py-1 rounded text-[var(--primary)]">content/audio_by_day.json</code>
                            </p>
                        )}
                    </div>
                </section>

                {/* Sources by Day Section */}
                <section className="mb-8 sm:mb-12">
                    <div className="bg-[var(--card)] rounded-lg p-4 sm:p-6 shadow-lg">
                        <h2 className="flex items-center gap-3 text-xl sm:text-2xl font-bold mb-4 text-[var(--foreground)]" style={{ fontFamily: 'var(--font-display)' }}>
                            <span className="inline-block w-1 h-5 sm:h-6 bg-[var(--primary)] rounded-sm flex-shrink-0" style={{ opacity: 0.85 }} />
                            Sources by Day
                        </h2>
                        {sourcesData ? (
                            <SourcesChart data={sourcesData} />
                        ) : (
                            <p className="text-[var(--muted-foreground)]">
                                No data available. Please create <code className="bg-[var(--background)] px-2 py-1 rounded text-[var(--primary)]">content/sources_by_day.json</code>
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </>
    );
}
