import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {Helmet} from 'react-helmet-async';
import {Activity, Copy, LockKeyhole, RefreshCw, LogOut} from 'lucide-react';
import {AdminAccessError, getLibraryHealth, getAdminSession, loginAdmin, logoutAdmin, type AdminSession, type LibraryHealth, type JobRun, type JobDetails, type HealthTrack} from '@/lib/operations';
import AdminRequests from '@/components/admin/AdminRequests';
import AdminAudio from '@/components/admin/AdminAudio';
import AdminMessages from '@/components/admin/AdminMessages';
import {DEFAULT_TITLE} from '@/lib/config';

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--card-hover)] disabled:opacity-50';
const inputClass = 'rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm';
const number = (value: number) => value.toLocaleString();
const jobName = (job: string) => job === 'reindex' ? 'Library scan' : 'Waveform generation';

function Timestamp({value}: {value?: string | null}) {
    return value ? <time dateTime={value}>{new Date(value).toLocaleString()}</time> : <span>Not recorded yet</span>;
}

function Status({state}: {state: JobRun['state']}) {
    const color = state === 'succeeded' ? 'text-[var(--success-text)]' : state === 'running' ? 'text-[var(--primary)]'
        : state === 'failed' ? 'text-[var(--error-text)]' : 'text-amber-400';
    return <span className={`inline-flex items-center gap-2 text-xs font-medium ${color}`}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
        {state === 'succeeded' ? 'Completed' : state === 'degraded' ? 'Completed with issues' : state[0].toUpperCase() + state.slice(1)}
    </span>;
}

function Details({details}: {details: JobDetails}) {
    return <div className="space-y-3 text-sm">
        {details.message && <p className="whitespace-pre-wrap break-words">{details.message}</p>}
        {details.resource && <code className="block break-all text-xs text-[var(--muted-foreground)]">{details.resource}</code>}
        {details.failureCounts && Object.keys(details.failureCounts).length > 0 && <dl className="flex flex-wrap gap-x-5 gap-y-1">
            {Object.entries(details.failureCounts).map(([stage, count]) => <div key={stage} className="flex gap-2"><dt>{stage}</dt><dd className="font-mono text-[var(--primary)]">{number(count)}</dd></div>)}
        </dl>}
        {!!details.failures?.length && <div className="space-y-3 border-l-2 border-[var(--primary-border)] pl-3">
            <p className="text-xs text-[var(--muted-foreground)]">Sampled failures (up to 5)</p>
            {details.failures.map((failure, index) => <div key={index}>
                <div className="text-xs font-medium text-[var(--primary)]">{failure.step}</div>
                <code className="block break-all text-xs">{failure.resource}</code>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--muted-foreground)]">{failure.message}</p>
            </div>)}
        </div>}
    </div>;
}

function TrackSample({tracks, empty}: {tracks: HealthTrack[]; empty: string}) {
    return tracks.length ? <ul className="divide-y divide-[var(--border)]">
        {tracks.map(track => <li key={track.id} className="py-3">
            <p className="text-sm font-medium">{track.title}</p>
            <code className="block break-all text-xs text-[var(--muted-foreground)]">{track.path}</code>
            {track.mediaId && <p className="mt-1 break-all font-mono text-xs text-[var(--primary)]">Media ID: {track.mediaId}</p>}
        </li>)}
    </ul> : <p className="py-4 text-sm text-[var(--muted-foreground)]">{empty}</p>;
}

function HealthView({health}: {health: LibraryHealth}) {
    const [jobFilter, setJobFilter] = useState('all');
    const [onlyIssues, setOnlyIssues] = useState(false);
    const [copyMessage, setCopyMessage] = useState('');
    const counts = health.library;
    const coverage = counts.tracks ? Math.round(counts.waveformReady / counts.tracks * 100) : 0;
    const runs = health.jobs.filter(run => (jobFilter === 'all' || run.job === jobFilter) && (!onlyIssues || ['degraded', 'failed', 'interrupted'].includes(run.state)));
    const copyCommand = async (job: string) => {
        try {
            await navigator.clipboard.writeText(`docker compose run --rm worker ./audio-share-backend ${job}`);
            setCopyMessage(`${jobName(job)} command copied.`);
        } catch { setCopyMessage('Could not copy. Select the command below and copy it manually.'); }
    };
    return <div className="space-y-8">
        <section aria-labelledby="coverage-heading" className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="coverage-heading" className="text-2xl">Library coverage</h2>
                <p className="font-mono text-sm text-[var(--primary)]">{number(counts.tracks)} indexed {counts.tracks === 1 ? 'track' : 'tracks'} · {number(counts.folders)} {counts.folders === 1 ? 'folder' : 'folders'}</p>
            </div>
            <div className="mt-5 flex items-baseline justify-between text-sm"><span>Waveforms ready</span><span className="font-mono">{number(counts.waveformReady)} / {number(counts.tracks)} · {coverage}%</span></div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-sm bg-[var(--secondary)]" role="img" aria-label={`${coverage}% of indexed tracks have waveforms`}>
                <div className="bg-[var(--primary)]" style={{width: `${coverage}%`}} />
                <div className="bg-[var(--primary-soft)]" style={{width: `${counts.tracks ? counts.waveformPending / counts.tracks * 100 : 0}%`}} />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
                {[[counts.waveformPending, 'Awaiting waveform'], [counts.awaitingIndex, 'Need reindexing'], [counts.identityConflicts, 'Identity conflicts'], [counts.unavailable, 'Source unavailable'], [counts.removalRequested, 'Removal requested'], [counts.deleted, 'Deleted records']].map(([value, label]) => <div key={label}>
                    <dd className="font-mono text-xl tabular-nums">{number(Number(value))}</dd><dt className="mt-1 text-xs text-[var(--muted-foreground)]">{label}</dt>
                </div>)}
            </dl>
        </section>

        <section aria-labelledby="jobs-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div><h2 id="jobs-heading" className="text-2xl">Maintenance runs</h2><p className="text-xs text-[var(--muted-foreground)]">Latest 30 runs. History starts after this update.</p></div>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm">Job <select aria-label="Filter maintenance runs" value={jobFilter} onChange={event => setJobFilter(event.target.value)} className={inputClass}><option value="all">All jobs</option><option value="reindex">Library scans</option><option value="waveform">Waveforms</option></select></label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyIssues} onChange={event => setOnlyIssues(event.target.checked)} /> Only issues</label>
                </div>
            </div>
            <p className="mb-3 text-xs text-[var(--muted-foreground)]">Schedules reflect this server’s configuration. A worker must be running to execute them.</p>
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
                {(['reindex', 'waveform'] as const).map(job => <div key={job} className="border-l-2 border-[var(--primary-border)] pl-3">
                    <p className="text-sm font-medium">{jobName(job)}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Last clean completion: <Timestamp value={health.lastSuccess[job]} /></p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">Schedule: <code>{(job === 'reindex' ? health.config.indexSchedule : health.config.waveformSchedule) || 'Manual only'}</code></p>
                </div>)}
            </div>
            <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
                {!runs.length && <p className="p-5 text-sm text-[var(--muted-foreground)]">{health.jobs.length ? 'No runs match these filters.' : 'No runs recorded yet. The next scheduled or manual job will appear here.'}</p>}
                {runs.map(run => <details key={run.id} className="group border-b border-[var(--border)] last:border-0">
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-[var(--card-hover)] [&::-webkit-details-marker]:hidden">
                        <span aria-hidden="true" className="shrink-0 text-xs group-open:rotate-90">▶</span>
                        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                            <span><span className="block text-sm font-medium">{jobName(run.job)}</span><span className="text-xs text-[var(--muted-foreground)]"><Timestamp value={run.startedAt} /></span></span>
                            <Status state={run.state} />
                        </span>
                    </summary>
                    <div className="space-y-4 border-t border-[var(--border)] p-4 sm:px-8">
                        <p className="text-xs text-[var(--muted-foreground)]">Run #{run.id} · {run.finishedAt ? <>Finished <Timestamp value={run.finishedAt} /></> : run.state === 'running' ? 'Job lock is held by this worker.' : 'Worker disconnected before recording completion; completion time is unknown.'}</p>
                        <p className="font-mono text-xs">{run.job === 'reindex' ? `${number(run.summary.folders)} folders visited · ${number(run.summary.deferredFolders)} deferred` : `${number(run.summary.attempted)} attempted · ${number(run.summary.processed)} stored`} · {number(run.summary.issues)} issues</p>
                        {run.state === 'running' && <p className="text-xs text-[var(--muted-foreground)]">Counts and failure details are recorded when the run finishes.</p>}
                        <Details details={run.summary.details || {}} />
                    </div>
                </details>)}
            </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="conflicts-heading" className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
                <h2 id="conflicts-heading" className="text-2xl">Identity conflicts</h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">Up to 20 recent records. Check duplicate media IDs and sidecars before reindexing.</p>
                <TrackSample tracks={health.conflicts} empty="No blocked identity records." />
            </section>
            <section aria-labelledby="backlog-heading" className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
                <h2 id="backlog-heading" className="text-2xl">Missing waveforms</h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">Up to 20 recently indexed tracks. Tracks needing reindexing must be scanned before waveform generation.</p>
                <TrackSample tracks={health.pendingWaveforms} empty="Every indexed track has a waveform." />
            </section>
        </div>

        <section aria-labelledby="errors-heading">
            <h2 id="errors-heading" className="text-2xl">Recent errors</h2>
            <p className="mb-4 text-xs text-[var(--muted-foreground)]">Latest 30 retained reports. {health.config.errorReportsEnabled ? 'Reporting is enabled.' : 'Error reporting is disabled; any reports shown were retained from earlier runs. Job history is still collected.'}</p>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
                {!health.errors.length && <p className="p-5 text-sm text-[var(--muted-foreground)]">No retained error reports.</p>}
                {health.errors.map(error => <details key={error.id} className="border-b border-[var(--border)] last:border-0">
                    <summary className="cursor-pointer p-4 text-sm"><span className="ml-2">{error.operation} · {error.stage} · {error.cause}</span><span className="ml-3 text-xs text-[var(--muted-foreground)]"><Timestamp value={error.createdAt} /></span></summary>
                    <div className="space-y-3 border-t border-[var(--border)] p-4 sm:px-8"><p className="text-xs text-[var(--muted-foreground)]">{error.origin} · {error.outcome} · {number(error.failedItems)} failed items</p><Details details={error.context} /></div>
                </details>)}
            </div>
        </section>

        <details className="rounded-lg border border-[var(--border)] p-5">
            <summary className="cursor-pointer text-sm font-medium">Run maintenance from your server</summary>
            <p className="my-3 text-sm text-[var(--muted-foreground)]">Correct the affected files, then run the appropriate command. A job already in progress keeps its lock; another invocation skips it.</p>
            {['reindex', 'waveform'].map(job => <div key={job} className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <code className="break-all text-xs">docker compose run --rm worker ./audio-share-backend {job}</code>
                <button className={buttonClass} onClick={() => void copyCommand(job)}><Copy className="h-3.5 w-3.5" /> Copy {job} command</button>
            </div>)}
            <p role="status" className="mt-3 text-xs text-[var(--muted-foreground)]">{copyMessage}</p>
        </details>
        <p className="break-all font-mono text-xs text-[var(--muted-foreground)]">Build {health.config.buildId || 'development'} · schema {health.schemaVersion} · up to 1,000 completed runs retained</p>
    </div>;
}

export default function Admin() {
    const [section, setSection] = useState('health');
    const [draftKey, setDraftKey] = useState('');
    const [session, setSession] = useState<AdminSession | null>(null);
    const [checking, setChecking] = useState(true);
    const [working, setWorking] = useState(false);
    const [logoutPending, setLogoutPending] = useState(false);
    const [health, setHealth] = useState<LibraryHealth | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const requestRef = useRef<AbortController | null>(null);
    const mounted = useRef(false);
    const connected = session !== null;

    const clearHealth = useCallback(() => {
        requestRef.current?.abort();
        requestRef.current = null;
        setHealth(null);
        setLoading(false);
    }, []);

    const onAuthFailure = useCallback((message: string) => {
        clearHealth(); setSession(null); setSection('health'); setError(message);
    }, [clearHealth]);

    const refresh = useCallback(async () => {
        if (requestRef.current) return;
        const controller = new AbortController();
        requestRef.current = controller;
        setLoading(true);
        setError('');
        try {
            const snapshot = await getLibraryHealth(controller.signal);
            if (!controller.signal.aborted) setHealth(snapshot);
        } catch (cause) {
            if (controller.signal.aborted) return;
            if (cause instanceof AdminAccessError) {
                setSession(null);
                setHealth(null);
            }
            setError(cause instanceof Error ? cause.message : 'Library health could not be refreshed.');
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        const controller = new AbortController();
        void getAdminSession(controller.signal).then(value => {
            if (!controller.signal.aborted) setSession(value);
        }).catch(cause => {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not check your admin session.');
        }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
        return () => { mounted.current = false; controller.abort(); requestRef.current?.abort(); requestRef.current = null; };
    }, []);

    useEffect(() => {
        if (!session) return;
        const expires = Date.parse(session.expiresAt);
        const refreshVisible = () => {
            if (Date.now() >= expires) {
                clearHealth();
                setSession(null);
                setError('Your admin session expired. Unlock the dashboard again.');
            } else if (!document.hidden) void refresh();
        };
        refreshVisible();
        const interval = window.setInterval(refreshVisible, 30_000);
        // Clamp long lifetimes to the browser's maximum timeout; the interval
        // and visibility check also enforce expiry after suspension.
        const timeout = window.setTimeout(refreshVisible, Math.min(Math.max(0, expires - Date.now()), 2_147_483_647));
        document.addEventListener('visibilitychange', refreshVisible);
        return () => { window.clearInterval(interval); window.clearTimeout(timeout); document.removeEventListener('visibilitychange', refreshVisible); };
    }, [session, refresh, clearHealth]);

    const connect = async (event: FormEvent) => {
        event.preventDefault();
        if (working) return;
        const key = draftKey.trim();
        setDraftKey(''); setWorking(true); setError('');
        try {
            const value = await loginAdmin(key);
            if (mounted.current) setSession(value);
        } catch (cause) {
            if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not unlock the dashboard.');
        } finally { if (mounted.current) setWorking(false); }
    };
    const disconnect = async () => {
        clearHealth(); setSession(null); setLogoutPending(true); setWorking(true); setError('');
        try {
            await logoutAdmin();
            if (mounted.current) setLogoutPending(false);
        } catch (cause) {
            if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not clear the admin cookie. Retry locking the dashboard.');
        } finally { if (mounted.current) setWorking(false); }
    };

    return <div className="mx-auto max-w-6xl">
        <Helmet><title>Admin - {DEFAULT_TITLE}</title><meta name="robots" content="noindex,nofollow" /></Helmet>
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div><p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--primary)]"><Activity className="h-4 w-4" /> Administration</p><h1 className="text-4xl sm:text-5xl">Library management</h1><p className="mt-2 text-sm text-[var(--muted-foreground)]">Library health, source requests, audio flags, and messages.</p></div>
            {connected && <div className="flex gap-2">{section === 'health' && <button className={buttonClass} disabled={loading} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} /> Refresh</button>}<button className={buttonClass} onClick={() => void disconnect()}><LogOut className="h-4 w-4" /> Lock dashboard</button></div>}
        </header>
        {error && <div role="alert" className="mb-5 rounded-md border border-[var(--error-border)] bg-[var(--error-bg)] p-4 text-sm text-[var(--error-text)]">{error}{health && section === 'health' && <span className="mt-1 block">Showing the last successful snapshot below.</span>}</div>}
        {checking && <p role="status">Checking admin session…</p>}
        {logoutPending && <button className={buttonClass} disabled={working} onClick={() => void disconnect()}>{working ? 'Locking dashboard…' : 'Retry locking dashboard'}</button>}
        {!checking && !connected && !logoutPending && <form onSubmit={event => void connect(event)} className="max-w-lg rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <LockKeyhole className="mb-4 h-6 w-6 text-[var(--primary)]" />
            <h2 className="text-2xl">Unlock administration</h2>
            <p className="mb-5 mt-2 text-sm text-[var(--muted-foreground)]">Enter the admin API key once to sign in. Your session survives refreshes and navigation until it expires or you lock the dashboard.</p>
            <label htmlFor="admin-key" className="mb-2 block text-sm">Admin API key</label>
            <input id="admin-key" type="password" autoComplete="off" required value={draftKey} onChange={event => setDraftKey(event.target.value)} className={`${inputClass} w-full`} />
            <button className={`${buttonClass} mt-4 bg-[var(--primary)] text-white`} disabled={working || !draftKey.trim()}>{working ? 'Unlocking…' : 'Unlock dashboard'}</button>
        </form>}
        {session && <p className="mb-3 text-xs text-[var(--muted-foreground)]">Session expires <Timestamp value={session.expiresAt} />.</p>}
        {connected && <nav aria-label="Admin sections" className="mb-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-4">{[['health', 'Health'], ['requests', 'Requests'], ['audio', 'Audio'], ['messages', 'Messages']].map(([value, label]) => <button key={value} aria-pressed={section === value} className={`${buttonClass} ${section === value ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : ''}`} onClick={() => setSection(value)}>{label}</button>)}</nav>}
        {connected && section === 'health' && <p className="mb-5 text-xs text-[var(--muted-foreground)]">{health ? <>Snapshot: <Timestamp value={health.generatedAt} /> · refreshes every 30 seconds while visible</> : loading ? 'Loading library health…' : 'No snapshot loaded. Use Refresh to try again.'}</p>}
        {connected && section === 'health' && health && <HealthView health={health} />}
        {connected && section === 'requests' && <AdminRequests onAuthFailure={onAuthFailure} />}
        {connected && section === 'audio' && <AdminAudio onAuthFailure={onAuthFailure} />}
        {connected && section === 'messages' && <AdminMessages onAuthFailure={onAuthFailure} />}
    </div>;
}
