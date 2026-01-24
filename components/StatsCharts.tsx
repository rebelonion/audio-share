'use client';

import {useState, useEffect} from 'react';
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
    const [hideZeroDays, setHideZeroDays] = useState(false);
    const [showCumulative, setShowCumulative] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const backfilledDays = backfillDays(data.days);
    const filteredDays = hideZeroDays ? backfilledDays.filter(day => day.count > 0) : backfilledDays;

    const cumulativeDays = filteredDays.reduce((acc, day, index) => {
        const previousTotal = index > 0 ? acc[index - 1].cumulative : 0;
        acc.push({
            ...day,
            cumulative: previousTotal + day.count
        });
        return acc;
    }, [] as (DayData & {cumulative: number})[]);

    const defaultStartIndex = Math.max(0, filteredDays.length - 30);
    const defaultEndIndex = Math.max(0, filteredDays.length - 1);

    const chartHeight = isMobile ? 300 : 450;
    const chartMargin = isMobile
        ? {top: 5, right: 5, left: -10, bottom: 5}
        : {top: 5, right: 30, left: 20, bottom: 5};

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <p className="text-[var(--muted-foreground)]">
                    Total: <span className="text-[var(--primary)] font-bold text-xl">{data.total.toLocaleString()}</span> files
                </p>
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <span className="text-sm text-[var(--muted-foreground)]">Cumulative</span>
                        <div
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                                showCumulative ? 'bg-[#8b5cf6]' : 'bg-[var(--border)]'
                            }`}
                            onClick={() => setShowCumulative(!showCumulative)}
                        >
                            <div
                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                    showCumulative ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <span className="text-sm text-[var(--muted-foreground)]">Hide zero days</span>
                        <div
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                                hideZeroDays ? 'bg-[#8b5cf6]' : 'bg-[var(--border)]'
                            }`}
                            onClick={() => setHideZeroDays(!hideZeroDays)}
                        >
                            <div
                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                    hideZeroDays ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </div>
                    </label>
                </div>
            </div>
            <ResponsiveContainer width="100%" height={chartHeight} key={`audio-${hideZeroDays}-${showCumulative}`}>
                {showCumulative ? (
                    <LineChart data={cumulativeDays} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                            dataKey="date"
                            stroke="var(--muted-foreground)"
                            tick={{fill: 'var(--muted-foreground)', fontSize: isMobile ? 10 : 12}}
                            angle={isMobile ? -45 : 0}
                            textAnchor={isMobile ? 'end' : 'middle'}
                            height={isMobile ? 60 : 30}
                            interval={isMobile ? Math.floor(cumulativeDays.length / 8) : 'preserveStartEnd'}
                        />
                        <YAxis
                            stroke="var(--muted-foreground)"
                            tick={{fill: 'var(--muted-foreground)', fontSize: isMobile ? 10 : 12}}
                            width={isMobile ? 30 : 60}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            wrapperStyle={{color: 'var(--foreground)', fontSize: isMobile ? '12px' : '14px'}}
                            iconType="circle"
                        />
                        <Line
                            type="monotone"
                            dataKey="cumulative"
                            stroke="#8b5cf6"
                            strokeWidth={isMobile ? 2 : 3}
                            name="Total Audio Files"
                            dot={false}
                            activeDot={{r: isMobile ? 6 : 8}}
                        />
                        <Brush
                            dataKey="date"
                            height={isMobile ? 40 : 30}
                            stroke="#8b5cf6"
                            fill="var(--card)"
                            startIndex={defaultStartIndex}
                            endIndex={defaultEndIndex}
                        />
                    </LineChart>
                ) : (
                    <BarChart data={filteredDays} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                            dataKey="date"
                            stroke="var(--muted-foreground)"
                            tick={{fill: 'var(--muted-foreground)', fontSize: isMobile ? 10 : 12}}
                            angle={isMobile ? -45 : 0}
                            textAnchor={isMobile ? 'end' : 'middle'}
                            height={isMobile ? 60 : 30}
                            interval={isMobile ? Math.floor(filteredDays.length / 8) : 'preserveStartEnd'}
                        />
                        <YAxis
                            stroke="var(--muted-foreground)"
                            tick={{fill: 'var(--muted-foreground)', fontSize: isMobile ? 10 : 12}}
                            width={isMobile ? 30 : 60}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            wrapperStyle={{color: 'var(--foreground)', fontSize: isMobile ? '12px' : '14px'}}
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
                            height={isMobile ? 40 : 30}
                            stroke="#8b5cf6"
                            fill="var(--card)"
                            startIndex={defaultStartIndex}
                            endIndex={defaultEndIndex}
                        />
                    </BarChart>
                )}
            </ResponsiveContainer>
        </>
    );
}

interface SourcesChartProps {
    data: SourcesByDayData;
}

export function SourcesChart({data}: SourcesChartProps) {
    const [hideZeroDays, setHideZeroDays] = useState(false);
    const [showCumulative, setShowCumulative] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const backfilledDays = backfillSourceDays(data.days);
    const filteredDays = hideZeroDays ? backfilledDays.filter(day => day.count > 0) : backfilledDays;

    const cumulativeDays = filteredDays.reduce((acc, day, index) => {
        const previousTotal = index > 0 ? acc[index - 1].cumulative : 0;
        acc.push({
            ...day,
            cumulative: previousTotal + day.count
        });
        return acc;
    }, [] as (SourceDayData & {cumulative: number})[]);

    const defaultStartIndex = Math.max(0, filteredDays.length - 30);
    const defaultEndIndex = Math.max(0, filteredDays.length - 1);

    const chartHeight = isMobile ? 300 : 450;
    const chartMargin = isMobile
        ? {top: 5, right: 5, left: -10, bottom: 5}
        : {top: 5, right: 30, left: 20, bottom: 5};

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <p className="text-[var(--muted-foreground)]">
                    Total: <span className="text-[var(--primary)] font-bold text-xl">{data.total.toLocaleString()}</span> sources
                </p>
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <span className="text-sm text-[var(--muted-foreground)]">Cumulative</span>
                        <div
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                                showCumulative ? 'bg-[#8b5cf6]' : 'bg-[var(--border)]'
                            }`}
                            onClick={() => setShowCumulative(!showCumulative)}
                        >
                            <div
                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                    showCumulative ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <span className="text-sm text-[var(--muted-foreground)]">Hide zero days</span>
                        <div
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                                hideZeroDays ? 'bg-[#8b5cf6]' : 'bg-[var(--border)]'
                            }`}
                            onClick={() => setHideZeroDays(!hideZeroDays)}
                        >
                            <div
                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                    hideZeroDays ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </div>
                    </label>
                </div>
            </div>
            <ResponsiveContainer width="100%" height={chartHeight} key={`sources-${hideZeroDays}-${showCumulative}`}>
                <LineChart data={showCumulative ? cumulativeDays : filteredDays} margin={chartMargin}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                        dataKey="date"
                        stroke="var(--muted-foreground)"
                        tick={{fill: 'var(--muted-foreground)', fontSize: isMobile ? 10 : 12}}
                        angle={isMobile ? -45 : 0}
                        textAnchor={isMobile ? 'end' : 'middle'}
                        height={isMobile ? 60 : 30}
                        interval={isMobile ? Math.floor(filteredDays.length / 8) : 'preserveStartEnd'}
                    />
                    <YAxis
                        stroke="var(--muted-foreground)"
                        tick={{fill: 'var(--muted-foreground)', fontSize: isMobile ? 10 : 12}}
                        width={isMobile ? 30 : 60}
                    />
                    <Tooltip content={showCumulative ? <CustomTooltip /> : <SourcesTooltip />} />
                    <Legend
                        wrapperStyle={{color: 'var(--foreground)', fontSize: isMobile ? '12px' : '14px'}}
                        iconType="circle"
                    />
                    <Line
                        type="monotone"
                        dataKey={showCumulative ? 'cumulative' : 'count'}
                        stroke="#8b5cf6"
                        strokeWidth={isMobile ? 2 : 3}
                        name={showCumulative ? 'Total Sources' : 'New Sources'}
                        dot={showCumulative ? false : {fill: '#8b5cf6', r: isMobile ? 3 : 5}}
                        activeDot={{r: isMobile ? 6 : 8}}
                    />
                    <Brush
                        dataKey="date"
                        height={isMobile ? 40 : 30}
                        stroke="#8b5cf6"
                        fill="var(--card)"
                        startIndex={defaultStartIndex}
                        endIndex={defaultEndIndex}
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Sources List */}
            <div className="mt-6 sm:mt-8">
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-[var(--foreground)]">Sources by Date</h3>
                <div className="space-y-3 sm:space-y-4 max-h-96 overflow-y-auto scrollbar-hide">
                    {data.days.map((day) => (
                        <div key={day.date} className="border border-[var(--border)] rounded-lg p-3 sm:p-4 bg-[var(--background)]">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-1">
                                <h4 className="font-semibold text-[var(--foreground)] text-sm sm:text-base">{day.date}</h4>
                                <span className="text-[var(--primary)] font-bold text-sm">{day.count} sources</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {day.sources.map((source, idx) => (
                                    <div
                                        key={idx}
                                        className="text-xs sm:text-sm text-[var(--muted-foreground)] bg-[var(--card)] px-2 sm:px-3 py-1 rounded truncate"
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
