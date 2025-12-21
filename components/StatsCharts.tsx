'use client';

import {LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush} from 'recharts';

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

interface TooltipPayload {
    color: string;
    name: string;
    value: number;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayload[];
    label?: string;
}

const CustomTooltip = ({active, payload, label}: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-lg shadow-lg">
                <p className="text-[var(--foreground)] font-semibold mb-1">{label}</p>
                {payload.map((entry, index) => (
                    <p key={index} style={{color: entry.color}} className="text-sm">
                        {entry.name}: {entry.value}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

interface SourcesTooltipProps {
    active?: boolean;
    payload?: {
        payload: SourceDayData;
    }[];
    label?: string;
}

const SourcesTooltip = ({active, payload, label}: SourcesTooltipProps) => {
    if (active && payload && payload.length) {
        const dayData = payload[0].payload;
        const maxDisplay = 10;
        const hasMore = dayData.sources.length > maxDisplay;
        const displaySources = dayData.sources.slice(0, maxDisplay);

        return (
            <div className="bg-[var(--card)] border border-[var(--border)] p-3 rounded-lg shadow-lg max-w-md">
                <p className="text-[var(--foreground)] font-semibold mb-2">{label}</p>
                <p className="text-[var(--primary)] font-bold text-sm mb-2">{dayData.count} sources</p>
                <div className="space-y-1">
                    {displaySources.map((source, idx) => (
                        <p key={idx} className="text-xs text-[var(--muted-foreground)]">
                            • {source}
                        </p>
                    ))}
                    {hasMore && (
                        <p className="text-xs text-[var(--muted-foreground)] italic">
                            + {dayData.sources.length - maxDisplay} more...
                        </p>
                    )}
                </div>
            </div>
        );
    }
    return null;
};

function backfillDays(days: DayData[]): DayData[] {
    if (days.length === 0) return [];

    const sortedDays = [...days].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstDate = new Date(sortedDays[0].date);
    const lastDate = new Date(sortedDays[sortedDays.length - 1].date);

    const dayMap = new Map(sortedDays.map(day => [day.date, day]));
    const result: DayData[] = [];

    const currentDate = new Date(firstDate);
    while (currentDate <= lastDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        result.push(dayMap.get(dateStr) || { date: dateStr, count: 0 });
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
}

function backfillSourceDays(days: SourceDayData[]): SourceDayData[] {
    if (days.length === 0) return [];

    const sortedDays = [...days].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstDate = new Date(sortedDays[0].date);
    const lastDate = new Date(sortedDays[sortedDays.length - 1].date);

    const dayMap = new Map(sortedDays.map(day => [day.date, day]));
    const result: SourceDayData[] = [];

    const currentDate = new Date(firstDate);
    while (currentDate <= lastDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        result.push(dayMap.get(dateStr) || { date: dateStr, count: 0, sources: [] });
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
}

interface AudioChartProps {
    data: AudioByDayData;
}

export function AudioChart({data}: AudioChartProps) {
    const backfilledDays = backfillDays(data.days);
    const startIndex = Math.max(0, backfilledDays.length - 30);

    return (
        <>
            <p className="text-[var(--muted-foreground)] mb-6">
                Total: <span className="text-[var(--primary)] font-bold text-xl">{data.total.toLocaleString()}</span> files
            </p>
            <ResponsiveContainer width="100%" height={450}>
                <BarChart data={backfilledDays} margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                        dataKey="date"
                        stroke="var(--muted-foreground)"
                        tick={{fill: 'var(--muted-foreground)'}}
                    />
                    <YAxis
                        stroke="var(--muted-foreground)"
                        tick={{fill: 'var(--muted-foreground)'}}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        wrapperStyle={{color: 'var(--foreground)'}}
                        iconType="circle"
                    />
                    <Bar
                        dataKey="count"
                        fill="#8b5cf6"
                        name="Audio Files"
                        radius={[8, 8, 0, 0]}
                    />
                    <Brush
                        dataKey="date"
                        height={30}
                        stroke="#8b5cf6"
                        fill="var(--card)"
                        startIndex={startIndex}
                    />
                </BarChart>
            </ResponsiveContainer>
        </>
    );
}

interface SourcesChartProps {
    data: SourcesByDayData;
}

export function SourcesChart({data}: SourcesChartProps) {
    const backfilledDays = backfillSourceDays(data.days);
    const startIndex = Math.max(0, backfilledDays.length - 30);

    return (
        <>
            <p className="text-[var(--muted-foreground)] mb-6">
                Total: <span className="text-[var(--primary)] font-bold text-xl">{data.total.toLocaleString()}</span> sources
            </p>
            <ResponsiveContainer width="100%" height={450}>
                <LineChart data={backfilledDays} margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                        dataKey="date"
                        stroke="var(--muted-foreground)"
                        tick={{fill: 'var(--muted-foreground)'}}
                    />
                    <YAxis
                        stroke="var(--muted-foreground)"
                        tick={{fill: 'var(--muted-foreground)'}}
                    />
                    <Tooltip content={<SourcesTooltip />} />
                    <Legend
                        wrapperStyle={{color: 'var(--foreground)'}}
                        iconType="circle"
                    />
                    <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        name="New Sources"
                        dot={{fill: '#8b5cf6', r: 5}}
                        activeDot={{r: 8}}
                    />
                    <Brush
                        dataKey="date"
                        height={30}
                        stroke="#8b5cf6"
                        fill="var(--card)"
                        startIndex={startIndex}
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Sources List */}
            <div className="mt-8">
                <h3 className="text-xl font-bold mb-4 text-[var(--foreground)]">Sources by Date</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto scrollbar-hide">
                    {data.days.map((day) => (
                        <div key={day.date} className="border border-[var(--border)] rounded-lg p-4 bg-[var(--background)]">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-semibold text-[var(--foreground)]">{day.date}</h4>
                                <span className="text-[var(--primary)] font-bold">{day.count} sources</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {day.sources.map((source, idx) => (
                                    <div
                                        key={idx}
                                        className="text-sm text-[var(--muted-foreground)] bg-[var(--card)] px-3 py-1 rounded truncate"
                                        title={source}
                                    >
                                        {source}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
