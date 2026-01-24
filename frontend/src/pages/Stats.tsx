import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { AudioChart, SourcesChart } from '@/components/StatsCharts';
import { API_BASE } from '@/lib/api';
import { DEFAULT_TITLE } from '@/lib/config';

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
    sources: string[];
}

interface SourcesByDayData {
    total: number;
    days: SourceDayData[];
}

export default function Stats() {
    const [audioData, setAudioData] = useState<AudioByDayData | null>(null);
    const [sourcesData, setSourcesData] = useState<SourcesByDayData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const response = await fetch(`${API_BASE}/api/stats`);
                if (response.ok) {
                    const data = await response.json();
                    setAudioData(data.audio);
                    setSourcesData(data.sources);
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
            <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
                <div className="h-10 bg-[var(--border)] rounded w-48 mb-8 animate-pulse"></div>
                <div className="bg-[var(--card)] rounded-lg p-6 mb-12">
                    <div className="h-8 bg-[var(--border)] rounded w-64 mb-4 animate-pulse"></div>
                    <div className="h-[450px] bg-[var(--border)] rounded animate-pulse"></div>
                </div>
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>{DEFAULT_TITLE} - Stats</title>
                <meta name="description" content="Statistics and analytics for audio archive" />
            </Helmet>
            <div className="max-w-7xl mx-auto px-4 py-4 sm:py-8">
                <h1 className="text-2xl sm:text-4xl font-bold mb-4 sm:mb-8 text-[var(--foreground)]">Statistics</h1>

                {/* Audio by Day Section */}
                <section className="mb-8 sm:mb-12">
                    <div className="bg-[var(--card)] rounded-lg p-4 sm:p-6 shadow-lg">
                        <h2 className="text-xl sm:text-2xl font-bold mb-2 text-[var(--foreground)]">Audio Files by Day</h2>
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
                        <h2 className="text-xl sm:text-2xl font-bold mb-2 text-[var(--foreground)]">Sources by Day</h2>
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
