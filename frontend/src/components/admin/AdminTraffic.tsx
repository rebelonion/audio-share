import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {useCallback, useState} from 'react';
import {Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {getTraffic, getTrafficLive, type TrafficKind, type TrafficLive, type TrafficRange, type TrafficReport} from '@/lib/adminManagement';
import {formatFileSize} from '@/lib/utils';
import {Feedback} from './shared';
import {useAdminPolling, type AuthFailure} from './useAdminTask';

const RANGES: {value: TrafficRange; label: string}[] = [{value: '1h', label: 'Last hour'}, {value: '24h', label: '24 hours'}, {value: '7d', label: '7 days'}, {value: '30d', label: '30 days'}];
const WINDOW_LABELS: Record<string, string> = {'1h': 'Last hour', '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time'};
const KINDS: {kind: TrafficKind; label: string; hint: string}[] = [
    {kind: 'stream', label: 'Streams', hint: 'Audio sent to the in-browser player'},
    {kind: 'download', label: 'Downloads', hint: 'Audio saved as files'},
    {kind: 'artwork', label: 'Artwork', hint: 'Thumbnails and posters'},
    {kind: 'web', label: 'Web app', hint: 'Pages, scripts, and styles'},
    {kind: 'api', label: 'API', hint: 'Search, metadata, and waveforms'},
];
const AXIS_TICK = {fill: 'var(--muted-foreground)', fontSize: 12};
const CURSOR = {stroke: 'var(--primary)', strokeWidth: 1, strokeOpacity: 0.4};

// Rates can be fractional; the shared size formatter expects whole bytes.
const formatBytes = (bytes: number) => formatFileSize(Math.round(bytes));
const rangeName = (range: TrafficRange) => RANGES.find(item => item.value === range)?.label.toLowerCase() ?? range;
const formatRate = (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`;

function formatTime(value: string, range: TrafficRange | 'live') {
    const date = new Date(value);
    if (range === '24h' || range === '7d') return date.toLocaleString(undefined, {weekday: 'short', hour: 'numeric', ...(range === '24h' ? {minute: '2-digit'} : {})});
    if (range === '30d') return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    return date.toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit', ...(range === 'live' ? {second: '2-digit'} : {})});
}

function bucketLabel(seconds: number) {
    return seconds >= 3600 ? `${seconds / 3600}-hour` : `${seconds / 60}-minute`;
}

interface ChartPoint {at: string; rate: number; bytes: number}

function RateTooltip({active, payload, range}: {active?: boolean; payload?: {payload: ChartPoint}[]; range: TrafficRange | 'live'}) {
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;
    return <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm shadow-lg">
        <p className="mb-1 text-xs text-[var(--muted-foreground)]">{range === 'live' ? formatTime(point.at, 'live') : new Date(point.at).toLocaleString(undefined, {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}</p>
        <p className="font-mono">{formatRate(point.rate)}</p>
        <p className="text-xs text-[var(--muted-foreground)]">{formatBytes(point.bytes)} sent</p>
    </div>;
}

function RateChart({points, range, height, label}: {points: ChartPoint[]; range: TrafficRange | 'live'; height: number; label: string}) {
    return <div role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={points} margin={{top: 8, right: 8, bottom: 0, left: 0}}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="at" tickFormatter={value => formatTime(value, range)} tick={AXIS_TICK} stroke="var(--border)" minTickGap={40} />
                <YAxis tickFormatter={value => formatRate(Number(value))} tick={AXIS_TICK} stroke="var(--border)" width={80} allowDecimals={false} />
                <Tooltip content={<RateTooltip range={range} />} cursor={CURSOR} isAnimationActive={false} />
                <Area type="monotone" dataKey="rate" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.12} isAnimationActive={false} activeDot={{r: 4, stroke: 'var(--card)', strokeWidth: 2}} />
            </AreaChart>
        </ResponsiveContainer>
    </div>;
}

// Problems saving this instance's counts. Shown above everything else, since
// they mean the history and totals are incomplete.
function SavingAlerts({live}: {live: TrafficLive | null}) {
    if (!live) return null;
    const {saving, discarded} = live;
    const time = (value: string) => <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
    return <>
        {saving.failingSince && <Alert>
            Traffic counts have not been saved since {saving.lastSavedAt ? time(saving.lastSavedAt) : 'this instance started'} (failing since {time(saving.failingSince)}). {formatBytes(saving.unsaved.bytes)} and {saving.unsaved.requests.toLocaleString()} requests are waiting, so the totals and history below are incomplete. Last error: {saving.lastError}
        </Alert>}
        {discarded.bytes + discarded.requests > 0 && <Alert>
            Since it started, this instance could not save {formatBytes(discarded.bytes)} and {discarded.requests.toLocaleString()} requests, so the totals and history below undercount by that much.
        </Alert>}
        {saving.pruneError && <p role="status" className="text-xs text-[var(--muted-foreground)]">Old traffic rows could not be cleaned up; this is retried hourly and does not affect counting. Error: {saving.pruneError}</p>}
    </>;
}

function LivePanel({live}: {live: TrafficLive | null}) {
    const samples = live?.samples ?? [];
    const recent = samples.slice(-6);
    // Divide by each sample's real length; the first after a restart is short.
    const current = recent.reduce((sum, sample) => sum + sample.bytes, 0) / Math.max(1, recent.reduce((sum, sample) => sum + sample.seconds, 0));
    const points = samples.map(sample => ({at: sample.at, bytes: sample.bytes, rate: sample.bytes / Math.max(1, sample.seconds)}));
    return <Card as="section" aria-labelledby="live-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h2 id="live-heading" className="text-2xl">Right now</h2>
                <p className="text-xs text-[var(--muted-foreground)]">Average over the last 30 seconds · this server instance · updates every 5 seconds</p>
            </div>
            <dl className="flex gap-6 text-right">
                <div><dd className="font-mono text-xl tabular-nums">{live?.activeStreams.toLocaleString() ?? '–'}</dd><dt className="text-xs text-[var(--muted-foreground)]">Open streams</dt></div>
                <div><dd className="font-mono text-xl tabular-nums">{live?.activeDownloads.toLocaleString() ?? '–'}</dd><dt className="text-xs text-[var(--muted-foreground)]">Open downloads</dt></div>
            </dl>
        </div>
        <p className="mt-4 font-mono text-4xl tabular-nums text-[var(--primary)]">{live ? formatRate(current) : '–'}</p>
        {points.length > 1
            ? <div className="mt-4"><RateChart points={points} range="live" height={140} label={`Throughput over the last ${Math.round(points.length * (live?.intervalSeconds ?? 5) / 60)} minutes, currently ${formatRate(current)}`} /></div>
            : <p className="mt-4 text-sm text-[var(--muted-foreground)]">{live ? 'Collecting samples. The live graph appears after the first 10 seconds.' : 'Loading live throughput…'}</p>}
    </Card>;
}

function Totals({report}: {report: TrafficReport}) {
    return <section aria-labelledby="totals-heading">
        <h2 id="totals-heading" className="mb-1 text-2xl">Data served</h2>
        <p className="mb-4 text-xs text-[var(--muted-foreground)]">Response bytes sent by every app instance{report.trackingSince ? <>, counted since <time dateTime={report.trackingSince}>{new Date(report.trackingSince).toLocaleString()}</time></> : ''}. Headers and TLS overhead are not included.</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {report.windows.map(span => <Card key={span.window} padding="none" className="p-4">
                <dd className="font-mono text-2xl tabular-nums">{formatBytes(span.total.bytes)}</dd>
                <dt className="mt-1 text-xs text-[var(--muted-foreground)]">{WINDOW_LABELS[span.window]}</dt>
                <dd className="mt-2 text-xs text-[var(--muted-foreground)]"><span className="block">{span.total.requests.toLocaleString()} requests</span><span className="block">{formatBytes(span.byKind.stream?.bytes ?? 0)} streamed</span></dd>
            </Card>)}
        </dl>
    </section>;
}

function History({report, error, range, onRange}: {report: TrafficReport | null; error: string; range: TrafficRange; onRange: (range: TrafficRange) => void}) {
    // Until the selected range arrives, show nothing derived from the previous one.
    const current = report?.range === range ? report : null;
    return <Card as="section" aria-labelledby="history-heading">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
                <h2 id="history-heading" className="text-2xl">Throughput history</h2>
                {current && <p className="text-xs text-[var(--muted-foreground)]">Average rate per {bucketLabel(current.bucketSeconds)} interval</p>}
            </div>
            <div role="group" aria-label="History range" className="flex flex-wrap gap-2">
                {RANGES.map(item => <Button key={item.value} size="sm" variant={range === item.value ? 'selected' : 'secondary'} aria-pressed={range === item.value} onClick={() => onRange(item.value)}>{item.label}</Button>)}
            </div>
        </div>
        {current && error && <p role="status" className="mb-3 text-xs text-[var(--error-text)]">Refresh failed: {error} Showing data from <time dateTime={current.generatedAt}>{new Date(current.generatedAt).toLocaleTimeString()}</time>.</p>}
        {current
            ? <HistoryDetails report={current} />
            : <p role="status" className="flex h-[260px] items-center justify-center text-center text-sm text-[var(--muted-foreground)]">{error
                ? `Could not load ${rangeName(range)}: ${error} Retrying every 30 seconds.`
                : `Loading ${rangeName(range)}…`}</p>}
    </Card>;
}

function HistoryDetails({report}: {report: TrafficReport}) {
    // Rates divide by the part of each interval that was tracked: the newest
    // interval is still in progress, and early ones may predate counting.
    const generated = Date.parse(report.generatedAt);
    const since = report.trackingSince ? Date.parse(report.trackingSince) : generated;
    const covered = (at: string) => {
        const start = Date.parse(at);
        return Math.max(0, (Math.min(start + report.bucketSeconds * 1000, generated) - Math.max(start, since)) / 1000);
    };
    const points = report.points.map(point => ({at: point.at, bytes: point.bytes, rate: point.bytes / Math.max(1, covered(point.at))}));
    const peak = points.reduce<ChartPoint | null>((best, point) => !best || point.rate > best.rate ? point : best, null);
    const selected = report.rangeTotal;
    const total = selected?.total.bytes ?? 0;
    const average = points.reduce((sum, point) => sum + point.bytes, 0) / Math.max(1, points.reduce((sum, point) => sum + covered(point.at), 0));
    const rangeLabel = rangeName(report.range);
    return <>
        <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div><dt className="text-xs text-[var(--muted-foreground)]">Average</dt><dd className="font-mono">{formatRate(average)}</dd></div>
            <div><dt className="text-xs text-[var(--muted-foreground)]">Peak {bucketLabel(report.bucketSeconds)} average</dt><dd className="font-mono">{peak && peak.rate > 0 ? <>{formatRate(peak.rate)} <span className="text-xs text-[var(--muted-foreground)]">at {formatTime(peak.at, report.range)}</span></> : '–'}</dd></div>
        </dl>
        <RateChart points={points} range={report.range} height={260} label={`Throughput over the ${rangeLabel}: average ${formatRate(average)}, peak ${formatRate(peak?.rate ?? 0)}`} />

        <h3 className="mb-3 mt-6 text-lg">By type, {rangeLabel}</h3>
        <p className="-mt-2 mb-3 text-xs text-[var(--muted-foreground)]">Covers the intervals in the chart. Requests are HTTP requests, not plays: a player makes several range requests per listen, more when seeking.</p>
        <ul className="space-y-3">
            {KINDS.map(({kind, label, hint}) => {
                const count = selected?.byKind[kind];
                const share = total ? (count?.bytes ?? 0) / total * 100 : 0;
                return <li key={kind}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                        <span>{label} <span className="text-xs text-[var(--muted-foreground)]">{hint}</span></span>
                        <span className="font-mono tabular-nums">{formatBytes(count?.bytes ?? 0)} <span className="text-xs text-[var(--muted-foreground)]">· {Math.round(share)}% · {(count?.requests ?? 0).toLocaleString()} req</span></span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--secondary)]" aria-hidden="true">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{width: `${share}%`}} />
                    </div>
                </li>;
            })}
        </ul>

        <details className="mt-6">
            <summary className="cursor-pointer text-sm">Show data table</summary>
            <div className="mt-3 max-h-80 overflow-auto overscroll-contain">
                <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[var(--card)] text-[var(--muted-foreground)]"><tr><th className="py-1 font-normal">Interval start</th><th className="py-1 text-right font-normal">Sent</th><th className="py-1 text-right font-normal">Average rate</th></tr></thead>
                    <tbody className="font-mono tabular-nums">
                        {[...points].reverse().map(point => <tr key={point.at} className="border-t border-[var(--border)]"><td className="py-1"><time dateTime={point.at}>{new Date(point.at).toLocaleString()}</time></td><td className="py-1 text-right">{formatBytes(point.bytes)}</td><td className="py-1 text-right">{formatRate(point.rate)}</td></tr>)}
                    </tbody>
                </table>
            </div>
        </details>
    </>;
}

export default function AdminTraffic({onAuthFailure}: {onAuthFailure: AuthFailure}) {
    const [range, setRange] = useState<TrafficRange>('24h');
    const loadReport = useCallback((signal: AbortSignal) => getTraffic(range, signal), [range]);
    const live = useAdminPolling(getTrafficLive, 5_000, onAuthFailure);
    const report = useAdminPolling(loadReport, 30_000, onAuthFailure);
    return <section aria-labelledby="traffic-heading" className="space-y-8">
        <div><h2 id="traffic-heading" className="text-3xl">Traffic</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">Bandwidth served to visitors, by time and type of content. Save problems on any instance also appear under Recent errors on the Health tab.</p></div>
        <Feedback error={live.error || (report.value ? '' : report.error)} notice="" />
        <SavingAlerts live={live.value} />
        <LivePanel live={live.value} />
        {report.value ? <>
            <Totals report={report.value} />
            <History report={report.value} error={report.error} range={range} onRange={setRange} />
        </> : !report.error && <p role="status" className="text-sm text-[var(--muted-foreground)]">Loading traffic history…</p>}
    </section>;
}
