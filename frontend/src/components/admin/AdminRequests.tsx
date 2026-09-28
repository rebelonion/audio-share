import {useRef, useState, type FormEvent} from 'react';
import type {RequestStatus, SourceRequest, Tag} from '@/types';
import {changeRequestStatus, createAdminRequest, deleteAdminRequest, editAdminRequest, listAdminRequests} from '@/lib/adminManagement';
import {buttonClass, inputClass, panelClass, Feedback, Pagination, SourceLink} from './shared';
import {useAdminList, useAdminTask, type AuthFailure} from './useAdminTask';

const statuses: {value: RequestStatus; label: string}[] = [
    {value: 'requested', label: 'Requested'}, {value: 'downloading', label: 'Downloading'},
    {value: 'indexing', label: 'Indexing'}, {value: 'added', label: 'Added'}, {value: 'rejected', label: 'Rejected'},
];

function TagsEditor({tags, onChange}: {tags: Tag[]; onChange: (tags: Tag[]) => void}) {
    return <div className="space-y-3">
        <p className="text-sm font-medium">Tags</p>
        {tags.map((tag, index) => <div key={index} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm">Name <input aria-label={`Tag ${index + 1} name`} className={inputClass} required value={tag.name} onChange={event => onChange(tags.map((value, i) => i === index ? {...value, name: event.target.value} : value))} /></label>
            <label className="w-28 text-sm">Color <input aria-label={`Tag ${index + 1} color`} className={inputClass} required placeholder="#c4882a" value={tag.color} onChange={event => onChange(tags.map((value, i) => i === index ? {...value, color: event.target.value} : value))} /></label>
            <button type="button" className={buttonClass} aria-label={`Remove tag ${index + 1}`} onClick={() => onChange(tags.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <button type="button" className={buttonClass} onClick={() => onChange([...tags, {name: '', color: '#c4882a'}])}>Add tag</button>
    </div>;
}

function RequestEditor({request, onChange, onClose, onAuthFailure}: {
    request: SourceRequest | null; onChange: (value: SourceRequest | null) => void; onClose: () => void; onAuthFailure: AuthFailure;
}) {
    const [title, setTitle] = useState(request?.title ?? '');
    const [url, setURL] = useState('');
    const [sourceKey, setSourceKey] = useState('');
    const [tags, setTags] = useState<Tag[]>(request?.tags ?? []);
    const [status, setStatus] = useState<RequestStatus>(request?.status ?? 'requested');
    const [folder, setFolder] = useState(request?.folderShareKey ?? '');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const task = useAdminTask(onAuthFailure);
    const saveDetails = (event: FormEvent) => {
        event.preventDefault();
        void task.run(async signal => {
            const details = {title: title.trim(), tags: tags.map(tag => ({name: tag.name.trim(), color: tag.color.trim()}))};
            if (request) {
                await editAdminRequest(request.id, details, signal);
                if (!signal.aborted) { onChange({...request, ...details}); task.setNotice('Request details saved.'); }
            } else {
                const created = await createAdminRequest({...details, submittedUrl: url.trim(), sourceKey: sourceKey.trim(), status}, signal);
                if (!signal.aborted) onChange(created);
            }
        });
    };
    const saveStatus = (event: FormEvent) => {
        event.preventDefault();
        if (!request) return;
        void task.run(async signal => {
            await changeRequestStatus(request.id, {status, folderShareKey: folder.trim() || null}, signal);
            if (!signal.aborted) {
                onChange({...request, status, folderShareKey: folder.trim() || undefined, folderPath: folder.trim() === request.folderShareKey ? request.folderPath : undefined});
                task.setNotice('Request status saved.');
            }
        });
    };
    const remove = () => {
        if (!request) return;
        void task.run(async signal => {
            await deleteAdminRequest(request.id, signal);
            if (!signal.aborted) onChange(null);
        });
    };
    return <section className={panelClass} aria-label={request ? 'Edit request' : 'New request'}>
        <div className="mb-5 flex items-center justify-between gap-3"><h3 className="text-2xl">{request ? `Edit request #${request.id}` : 'New request'}</h3><button className={buttonClass} disabled={task.busy} onClick={onClose}>Back to requests</button></div>
        <Feedback error={task.error} notice={task.notice} />
        {request && <p className="mb-5"><SourceLink url={request.submittedUrl} /></p>}
        <form onSubmit={saveDetails}>
            <fieldset disabled={task.busy} className="space-y-4">
                <label className="block text-sm">Title<input className={inputClass} required maxLength={500} value={title} onChange={event => setTitle(event.target.value)} /></label>
                {!request && <>
                    <label className="block text-sm">Source URL<input type="url" className={inputClass} required maxLength={2048} value={url} onChange={event => setURL(event.target.value)} /></label>
                    <label className="block text-sm">Source key (optional)<input className={inputClass} maxLength={500} value={sourceKey} onChange={event => setSourceKey(event.target.value)} /></label>
                    <label className="block text-sm">Initial status<select className={inputClass} value={status} onChange={event => setStatus(event.target.value as RequestStatus)}>{statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                </>}
                <TagsEditor tags={tags} onChange={setTags} />
                <button className={buttonClass} disabled={!title.trim() || tags.some(tag => !tag.name.trim() || !tag.color.trim())}>{task.busy ? 'Saving…' : request ? 'Save details' : 'Create request'}</button>
            </fieldset>
        </form>
        {request && <>
            <form onSubmit={saveStatus} className="mt-6 border-t border-[var(--border)] pt-5">
                <fieldset disabled={task.busy} className="space-y-4">
                    <label className="block text-sm">Status<select className={inputClass} value={status} onChange={event => setStatus(event.target.value as RequestStatus)}>{statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    <label className="block text-sm">Folder share key (optional)<input className={inputClass} value={folder} onChange={event => setFolder(event.target.value)} /></label>
                    <p className="text-xs text-[var(--muted-foreground)]">Leave the folder key blank to remove the folder association.</p>
                    <button className={buttonClass}>Save status</button>
                </fieldset>
            </form>
            <div className="mt-6 border-t border-[var(--border)] pt-5">
                {confirmDelete ? <div className="space-y-3">
                    <p className="break-words text-sm">Delete “{request.title}”? This cannot be undone.</p>
                    <div className="flex flex-wrap gap-2"><button className={`${buttonClass} text-[var(--error-text)]`} disabled={task.busy} onClick={remove}>Confirm delete</button><button className={buttonClass} disabled={task.busy} onClick={() => setConfirmDelete(false)}>Cancel deletion</button></div>
                </div> : <button className={`${buttonClass} text-[var(--error-text)]`} disabled={task.busy} onClick={() => setConfirmDelete(true)}>Delete request</button>}
            </div>
        </>}
    </section>;
}

export default function AdminRequests({onAuthFailure}: {onAuthFailure: AuthFailure}) {
    const heading = useRef<HTMLHeadingElement>(null);
    const list = useAdminList(listAdminRequests, onAuthFailure);
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(1);
    const matches = list.items.filter(item => (filter === 'all' || item.status === filter) && `${item.title} ${item.submittedUrl} ${item.tags.map(tag => tag.name).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
    const currentPage = Math.min(page, Math.max(1, Math.ceil(matches.length / 25)));
    const selected = list.items.find(item => item.id === editing) ?? null;
    if (editing !== null) return <RequestEditor key={editing} request={selected} onAuthFailure={onAuthFailure} onClose={() => setEditing(null)} onChange={value => {
        if (value) {
            list.setItems(items => editing === 'new' ? [value, ...items] : items.map(item => item.id === value.id ? value : item));
            if (editing === 'new') { setEditing(value.id); list.setNotice('Request created.'); }
        } else { list.setItems(items => items.filter(item => item.id !== editing)); setEditing(null); list.setNotice('Request deleted.'); }
    }} />;
    return <section aria-labelledby="requests-heading">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 ref={heading} tabIndex={-1} id="requests-heading" className="text-3xl">Source requests</h2><div className="flex gap-2"><button className={buttonClass} disabled={list.busy} onClick={() => void list.reload()}>Refresh requests</button><button className={buttonClass} disabled={list.busy} onClick={() => setEditing('new')}>New request</button></div></div>
        <Feedback error={list.error} notice={list.notice} />
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="text-sm">Search requests<input type="search" className={inputClass} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
            <label className="text-sm">Filter status<select className={inputClass} value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option>{statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        {list.busy && <p role="status" className="mb-3 text-sm">Loading requests…</p>}
        {list.loaded && !matches.length && <p className={panelClass}>No requests match these filters.</p>}
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
            {matches.slice((currentPage - 1) * 25, currentPage * 25).map(item => <li key={item.id} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0"><p className="break-words font-medium">{item.title}</p><p className="my-1 text-xs capitalize text-[var(--primary)]">{item.status} · #{item.id}</p><SourceLink url={item.submittedUrl} />{item.tags.length > 0 && <p className="mt-2 break-words text-xs text-[var(--muted-foreground)]">{item.tags.map(tag => tag.name).join(' · ')}</p>}</div>
                <button className={`${buttonClass} shrink-0`} disabled={list.busy} aria-label={`Edit ${item.title}`} onClick={() => setEditing(item.id)}>Edit</button>
            </li>)}
        </ul>
        {list.loaded && <Pagination page={currentPage} total={matches.length} onPage={value => { setPage(value); heading.current?.focus(); heading.current?.scrollIntoView({block: 'start'}); }} />}
    </section>;
}
