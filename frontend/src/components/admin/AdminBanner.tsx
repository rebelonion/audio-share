import Card from '@/components/ui/Card';
import {Button} from '@/components/ui/Button';
import {Input, Textarea} from '@/components/ui/Field';
import CustomSelect from '@/components/CustomSelect';
import {InfoBannerView} from '@/components/InfoBanner';
import {useCallback, useEffect, useState, type FormEvent} from 'react';
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
                    <div><label className="block text-sm">Message<Textarea className="min-h-24" required rows={3} aria-describedby="banner-message-limit" value={draft.message} onChange={event => set('message')(event.target.value)} /></label><Limit id="banner-message-limit" value={draft.message} max={limits.message} /></div>
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
