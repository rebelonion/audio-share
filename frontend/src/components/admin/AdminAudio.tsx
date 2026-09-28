import {useRef, useState} from 'react';
import {listAudioSources, setAudioRemovalRequested, setAudioUnavailable, type AudioSource} from '@/lib/adminManagement';
import {buttonClass, inputClass, panelClass, Feedback, Pagination, SourceLink} from './shared';
import {useAdminList, type AuthFailure} from './useAdminTask';

export default function AdminAudio({onAuthFailure}: {onAuthFailure: AuthFailure}) {
    const heading = useRef<HTMLHeadingElement>(null);
    const removalTrigger = useRef<HTMLButtonElement | null>(null);
    const list = useAdminList(listAudioSources, onAuthFailure);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [removal, setRemoval] = useState<AudioSource | null>(null);
    const matches = list.items.filter(item => (filter === 'all' || (filter === 'unavailable' ? item.unavailableAt : item.removalRequestedAt)) && `${item.title ?? ''} ${item.filename} ${item.webpageUrl} ${item.shareKey}`.toLowerCase().includes(search.toLowerCase()));
    const currentPage = Math.min(page, Math.max(1, Math.ceil(matches.length / 25)));
    const updateFlag = (item: AudioSource, flag: 'unavailableAt' | 'removalRequestedAt') => void list.run(async signal => {
        const enabled = !item[flag];
        if (flag === 'unavailableAt') await setAudioUnavailable(item.shareKey, enabled, signal);
        else await setAudioRemovalRequested(item.shareKey, enabled, signal);
        if (!signal.aborted) {
            list.setItems(items => items.map(row => row.shareKey === item.shareKey ? {...row, [flag]: enabled ? new Date().toISOString() : null} : row));
            setRemoval(null);
            list.setNotice(`${item.title || item.filename}: ${flag === 'unavailableAt' ? 'source unavailable' : 'removal requested'} ${enabled ? 'marked' : 'cleared'}.`);
        }
    });
    return <section aria-labelledby="audio-heading">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 ref={heading} tabIndex={-1} id="audio-heading" className="text-3xl">Audio sources</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">Tracks with source URLs. Mark unavailable sources or handle removal requests.</p></div><button className={buttonClass} disabled={list.busy} onClick={() => { setRemoval(null); void list.reload(); }}>Refresh audio</button></div>
        <Feedback error={list.error} notice={list.notice} />
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="text-sm">Search audio<input type="search" className={inputClass} value={search} onChange={event => { setRemoval(null); setSearch(event.target.value); setPage(1); }} /></label>
            <label className="text-sm">Filter flags<select className={inputClass} value={filter} onChange={event => { setRemoval(null); setFilter(event.target.value); setPage(1); }}><option value="all">All tracks</option><option value="unavailable">Source unavailable</option><option value="removal">Removal requested</option></select></label>
        </div>
        {list.busy && <p role="status" className="mb-3 text-sm">Updating audio…</p>}
        {list.loaded && !matches.length && <p className={panelClass}>No audio matches these filters.</p>}
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
            {matches.slice((currentPage - 1) * 25, currentPage * 25).map(item => <li key={item.shareKey} className="p-4">
                <p className="break-words font-medium">{item.title || item.filename}</p>
                <p className="mb-1 break-all text-xs text-[var(--muted-foreground)]">{item.filename} · {item.shareKey}</p>
                <SourceLink url={item.webpageUrl} />
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={item.unavailableAt ? 'text-amber-400' : 'text-[var(--muted-foreground)]'}>{item.unavailableAt ? 'Source unavailable' : 'Source not flagged'}</span>
                    <span className={item.removalRequestedAt ? 'text-[var(--error-text)]' : 'text-[var(--muted-foreground)]'}>· {item.removalRequestedAt ? 'Removal requested' : 'No removal request'}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button className={buttonClass} disabled={list.busy || !!removal} onClick={() => updateFlag(item, 'unavailableAt')}>{item.unavailableAt ? 'Clear unavailable flag' : 'Mark source unavailable'}</button>
                    <button className={buttonClass} disabled={list.busy || (!!removal && removal.shareKey !== item.shareKey)} onClick={event => { if (item.removalRequestedAt) updateFlag(item, 'removalRequestedAt'); else { removalTrigger.current = event.currentTarget; setRemoval(item); } }}>{item.removalRequestedAt ? 'Clear removal request' : 'Mark removal requested'}</button>
                </div>
        {removal?.shareKey === item.shareKey && <div className={`${panelClass} mt-4 space-y-3`}>
            <p className="break-words text-sm">Mark “{removal.title || removal.filename}” for removal? Public playback and downloads will be blocked.</p>
            <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={list.busy} onClick={() => updateFlag(removal, 'removalRequestedAt')}>Confirm removal request</button><button autoFocus className={buttonClass} disabled={list.busy} onClick={() => { setRemoval(null); removalTrigger.current?.focus(); }}>Cancel</button></div>
        </div>}
            </li>)}
        </ul>
        {list.loaded && <Pagination page={currentPage} total={matches.length} onPage={value => { setRemoval(null); setPage(value); heading.current?.focus(); heading.current?.scrollIntoView({block: 'start'}); }} />}
    </section>;
}
