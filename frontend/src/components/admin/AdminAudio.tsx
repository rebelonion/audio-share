import EmptyState from '@/components/ui/EmptyState';
import Card from '@/components/ui/Card';
import Pagination from '@/components/ui/Pagination';
import {Button} from '@/components/ui/Button';
import {Input} from '@/components/ui/Field';
import CustomSelect from '@/components/CustomSelect';
import {useRef, useState} from 'react';
import {listAudioSources, setAudioRemovalRequested, setAudioUnavailable, type AudioSource} from '@/lib/adminManagement';
import {Feedback, SourceLink} from './shared';
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
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 ref={heading} tabIndex={-1} id="audio-heading" className="text-3xl">Audio sources</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">Tracks with source URLs. Mark unavailable sources or handle removal requests.</p></div><Button variant="secondary" disabled={list.busy} onClick={() => { setRemoval(null); void list.reload(); }}>Refresh audio</Button></div>
        <Feedback error={list.error} notice={list.notice} />
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="text-sm">Search audio<Input type="search" value={search} onChange={event => { setRemoval(null); setSearch(event.target.value); setPage(1); }} /></label>
            <label className="text-sm">Filter flags<CustomSelect ariaLabel="Filter flags" fieldSize="md" value={filter} onChange={value => { setRemoval(null); setFilter(value); setPage(1); }} options={[{value: 'all', label: 'All tracks'}, {value: 'unavailable', label: 'Source unavailable'}, {value: 'removal', label: 'Removal requested'}]} /></label>
        </div>
        {list.busy && <p role="status" className="mb-3 text-sm">Updating audio…</p>}
        {list.loaded && !matches.length && <EmptyState title="No audio matches these filters." compact variant="card" />}
        <Card as="ul" padding="none" className="divide-y divide-[var(--border)]">
            {matches.slice((currentPage - 1) * 25, currentPage * 25).map(item => <li key={item.shareKey} className="p-4">
                <p className="break-words font-medium">{item.title || item.filename}</p>
                <p className="mb-1 break-all text-xs text-[var(--muted-foreground)]">{item.filename} · {item.shareKey}</p>
                <SourceLink url={item.webpageUrl} />
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={item.unavailableAt ? 'text-amber-400' : 'text-[var(--muted-foreground)]'}>{item.unavailableAt ? 'Source unavailable' : 'Source not flagged'}</span>
                    <span className={item.removalRequestedAt ? 'text-[var(--error-text)]' : 'text-[var(--muted-foreground)]'}>· {item.removalRequestedAt ? 'Removal requested' : 'No removal request'}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={list.busy || !!removal} onClick={() => updateFlag(item, 'unavailableAt')}>{item.unavailableAt ? 'Clear unavailable flag' : 'Mark source unavailable'}</Button>
                    <Button variant="secondary" disabled={list.busy || (!!removal && removal.shareKey !== item.shareKey)} onClick={event => { if (item.removalRequestedAt) updateFlag(item, 'removalRequestedAt'); else { removalTrigger.current = event.currentTarget; setRemoval(item); } }}>{item.removalRequestedAt ? 'Clear removal request' : 'Mark removal requested'}</Button>
                </div>
        {removal?.shareKey === item.shareKey && <Card className="mt-4 space-y-3">
            <p className="break-words text-sm">Mark “{removal.title || removal.filename}” for removal? Public playback and downloads will be blocked.</p>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={list.busy} onClick={() => updateFlag(removal, 'removalRequestedAt')}>Confirm removal request</Button><Button variant="secondary" autoFocus disabled={list.busy} onClick={() => { setRemoval(null); removalTrigger.current?.focus(); }}>Cancel</Button></div>
        </Card>}
            </li>)}
        </Card>
        {list.loaded && <Pagination className="mt-4" page={currentPage} pages={Math.max(1, Math.ceil(matches.length / 25))} total={matches.length} onPage={value => { setRemoval(null); setPage(value); heading.current?.focus(); heading.current?.scrollIntoView({block: 'start'}); }} />}
    </section>;
}
