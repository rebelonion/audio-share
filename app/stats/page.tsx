import {Metadata} from 'next';
import fs from 'fs';
import path from 'path';
import {AudioChart, SourcesChart} from '@/components/StatsCharts';

export const metadata: Metadata = {
    title: (process.env.DEFAULT_TITLE ? process.env.DEFAULT_TITLE + ' - Stats' : 'Audio Archive - Stats'),
    description: 'Statistics and analytics for audio archive'
};

export const dynamic = 'force-dynamic';

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

function loadAudioByDay(): AudioByDayData | null {
    try {
        const filePath = path.join(process.cwd(), 'content', 'audio_by_day.json');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('Error reading content/audio_by_day.json:', error);
        return null;
    }
}

function loadSourcesByDay(): SourcesByDayData | null {
    try {
        const filePath = path.join(process.cwd(), 'content', 'sources_by_day.json');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('Error reading content/sources_by_day.json:', error);
        return null;
    }
}

export default function StatsPage() {
    const audioData = loadAudioByDay();
    const sourcesData = loadSourcesByDay();

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-8 text-[var(--foreground)]">Statistics</h1>

            {/* Audio by Day Section */}
            <section className="mb-12">
                <div className="bg-[var(--card)] rounded-lg p-6 shadow-lg">
                    <h2 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Audio Files by Day</h2>
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
            <section className="mb-12">
                <div className="bg-[var(--card)] rounded-lg p-6 shadow-lg">
                    <h2 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Sources by Day</h2>
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
    );
}
