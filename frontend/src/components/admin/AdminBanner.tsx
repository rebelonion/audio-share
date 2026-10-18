import Card from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {Input, Textarea} from '@/components/ui/Field';
import CustomSelect from '@/components/CustomSelect';
import {InfoBannerView} from '@/components/InfoBanner';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {buildBannerToken, type BannerTokenKind} from '@/lib/bannerTokens';
import {clearSiteBanner, getSiteBanner, saveSiteBanner} from '@/lib/adminManagement';
import type {BannerVariant, SiteBanner} from '@/lib/config';
import {Feedback} from './shared';
import {useAdminTask, type AuthFailure} from './useAdminTask';

const variants: {value: BannerVariant; label: string}[] = [{value: 'info', label: 'Info'}, {value: 'warning', label: 'Warning'}, {value: 'success', label: 'Success'}];
const empty = {message: '', variant: 'info' as BannerVariant, linkText: '', linkUrl: ''};
const toDraft = (banner: SiteBanner | null) => banner ? {...banner, linkText: banner.linkText ?? '', linkUrl: banner.linkUrl ?? ''} : empty;
// Matches the server, which trims fields and counts characters (code points),
// not the UTF-16 units maxLength would count.
const limits = {message: 500, linkText: 80, linkUrl: 2000};
const length = (value: string) => [...value.trim()].length;
// Other servers cache the banner briefly, so changes are not instant everywhere.
const propagation = 'within about 15 seconds';

const tokenKinds: {value: BannerTokenKind; label: string}[] = [
    {value: 'countdown', label: 'Countdown'}, {value: 'datetime', label: 'Date and time'}, {value: 'date', label: 'Date'},
    {value: 'time', label: 'Time'}, {value: 'relative', label: 'Relative (in 3 hours)'},
];

// Inserts a placeholder that each visitor sees in their own time zone. The
// admin picks a moment in their own local time; the token stores it as UTC.
function InsertToken({onInsert}: {onInsert: (token: string) => void}) {
    const [kind, setKind] = useState<BannerTokenKind>('countdown');
    const [when, setWhen] = useState('');
    const [endText, setEndText] = useState('');
    const token = buildBannerToken(kind, when, endText);
    return <div className="rounded-md border border-[var(--border)] p-3">
        <p className="mb-2 text-sm">Insert a time</p>
        <p className="mb-3 text-xs text-[var(--muted-foreground)]">Visitors see it in their own time zone; countdowns and relative times update live. Pick the moment in your time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
        <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Show as <CustomSelect ariaLabel="Time format" fieldSize="md" value={kind} onChange={value => setKind(value as BannerTokenKind)} options={tokenKinds} /></label>
            <label className="block text-sm">Moment<Input type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} /></label>
            {kind === 'countdown' && <label className="block text-sm sm:col-span-2">Text once it ends (optional)<Input placeholder="Live now" value={endText} onChange={event => setEndText(event.target.value)} /></label>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" disabled={!token} onClick={() => { if (token) onInsert(token); }}>Insert</Button>
            {token && <code className="text-xs text-[var(--muted-foreground)]">{token}</code>}
        </div>
    </div>;
}

function Limit({id, value, max}: {id: string; value: string; max: number}) {
    const count = length(value);
    return <span id={id} className={`mt-1 block text-xs ${count > max ? 'text-[var(--error-text)]' : 'text-[var(--muted-foreground)]'}`}>
        {count > max ? `${count - max} ${count - max === 1 ? 'character' : 'characters'} over the ${max}-character limit` : `${count} / ${max}`}
    </span>;
}

export default function AdminBanner({onAuthFailure}: {onAuthFailure: AuthFailure}) {
    const [draft, setDraft] = useState(empty);
    const [live, setLive] = useState<SiteBanner | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [action, setAction] = useState<'save' | 'remove'>('save');
    const task = useAdminTask(onAuthFailure);
    const messageRef = useRef<HTMLTextAreaElement>(null);
    const {run} = task;
    const load = useCallback(() => void run(async signal => {
        const {banner} = await getSiteBanner(signal);
        if (!signal.aborted) { setLive(banner); setDraft(toDraft(banner)); setLoaded(true); }
    }), [run]);
    useEffect(load, [load]);
    const set = (field: keyof typeof empty) => (value: string) => setDraft(current => ({...current, [field]: value}));
    const save = (event: FormEvent) => {
        event.preventDefault();
        setAction('save');
        void task.run(async signal => {
            const {banner} = await saveSiteBanner(draft, signal);
            if (!signal.aborted) { setLive(banner); setDraft(toDraft(banner)); task.setNotice(`Banner saved. Visitors see it on pages they load ${propagation}.`); }
        });
    };
    const remove = () => { setAction('remove'); void task.run(async signal => {
        await clearSiteBanner(signal);
        if (!signal.aborted) { setLive(null); setDraft(empty); task.setNotice(`Banner removed. Pages that visitors load ${propagation} no longer show it.`); }
    }); };
    const insertToken = (token: string) => {
        const field = messageRef.current;
        const start = field?.selectionStart ?? draft.message.length;
        const end = field?.selectionEnd ?? start;
        setDraft(current => ({...current, message: current.message.slice(0, start) + token + current.message.slice(end)}));
        requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + token.length, start + token.length); });
    };
    const message = draft.message.trim();
    const tooLong = (Object.keys(limits) as (keyof typeof limits)[]).some(field => length(draft[field]) > limits[field]);
    const unchanged = live !== null && JSON.stringify(toDraft(live)) === JSON.stringify(draft);
    return <section aria-labelledby="banner-heading" className="max-w-2xl">
        <h2 id="banner-heading" className="mb-2 text-3xl">Site banner</h2>
        <p className="mb-5 text-sm text-[var(--muted-foreground)]">A notice shown above every page. Visitors can dismiss it; changing the message or link shows it to them again.</p>
        <Card>
            <Feedback error={task.error} notice={task.notice} />
            {!loaded && (task.busy || !task.error) && <p role="status" className="text-sm text-[var(--muted-foreground)]">Loading banner…</p>}
            {!loaded && !task.busy && task.error && <Button variant="secondary" onClick={load}>Retry</Button>}
            {loaded && <form onSubmit={save}>
                <fieldset disabled={task.busy} className="space-y-4">
                    <p className="text-sm">Status: <span className={live ? 'text-[var(--success-text)]' : 'text-[var(--muted-foreground)]'}>{live ? 'Showing' : 'No banner'}</span></p>
                    <div><label className="block text-sm">Message<Textarea ref={messageRef} className="min-h-24" required rows={3} aria-describedby="banner-message-limit" value={draft.message} onChange={event => set('message')(event.target.value)} /></label><Limit id="banner-message-limit" value={draft.message} max={limits.message} /></div>
                    <InsertToken onInsert={insertToken} />
                    <label className="block text-sm">Style <CustomSelect ariaLabel="Banner style" fieldSize="md" value={draft.variant} onChange={set('variant')} options={variants} /></label>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div><label className="block text-sm">Link text (optional)<Input placeholder="Learn more" aria-describedby="banner-link-text-limit" value={draft.linkText} onChange={event => set('linkText')(event.target.value)} /></label>{length(draft.linkText) > limits.linkText && <Limit id="banner-link-text-limit" value={draft.linkText} max={limits.linkText} />}</div>
                        <div><label className="block text-sm">Link URL (optional)<Input placeholder="/requests or https://…" aria-describedby="banner-link-url-limit" value={draft.linkUrl} onChange={event => set('linkUrl')(event.target.value)} /></label>{length(draft.linkUrl) > limits.linkUrl && <Limit id="banner-link-url-limit" value={draft.linkUrl} max={limits.linkUrl} />}</div>
                    </div>
                    {message && <div><p className="mb-2 text-xs text-[var(--muted-foreground)]">Preview</p>
                        <div className="overflow-hidden rounded-md border border-[var(--border)]"><InfoBannerView preview banner={{...draft, message, linkText: draft.linkText.trim(), linkUrl: draft.linkUrl.trim()}} /></div>
                    </div>}
                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" variant="secondary" disabled={!message || tooLong || unchanged}>{task.busy && action === 'save' ? 'Saving…' : live ? 'Update banner' : 'Show banner'}</Button>
                        {live && <Button variant="danger" onClick={remove}>{task.busy && action === 'remove' ? 'Removing…' : 'Remove banner'}</Button>}
                    </div>
                </fieldset>
            </form>}
        </Card>
    </section>;
}
