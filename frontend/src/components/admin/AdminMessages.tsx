import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import {Button} from '@/components/ui/Button';
import {Input, Textarea} from '@/components/ui/Field';
import {useRef, useState, type FormEvent} from 'react';
import {deleteTargetedMessage, listTargetedMessages, sendTargetedMessage, type PendingTargetedMessage} from '@/lib/adminManagement';
import {Feedback} from './shared';
import {useAdminList, useAdminTask, type AuthFailure} from './useAdminTask';

export default function AdminMessages({onAuthFailure}: {onAuthFailure: AuthFailure}) {
    const [sessionId, setSessionId] = useState('');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [deleting, setDeleting] = useState<PendingTargetedMessage | null>(null);
    const deleteTrigger = useRef<HTMLButtonElement | null>(null);
    const task = useAdminTask(onAuthFailure);
    const pending = useAdminList(listTargetedMessages, onAuthFailure);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        void task.run(async signal => {
            const result = await sendTargetedMessage({sessionId: sessionId.trim(), title: title.trim(), message: message.trim()}, signal);
            if (!signal.aborted) {
                setSessionId(''); setTitle(''); setMessage('');
                pending.setItems(items => [result, ...items.filter(item => item.id !== result.id)]);
                task.setNotice(`Message #${result.id} queued for that session. It will appear when the visitor next checks for messages.`);
            }
        });
    };
    const remove = (item: PendingTargetedMessage) => void pending.run(async signal => {
        const deleted = await deleteTargetedMessage(item.id, signal);
        if (!signal.aborted) {
            pending.setItems(items => items.filter(row => row.id !== item.id));
            setDeleting(null);
            pending.setNotice(deleted
                ? `Message #${item.id} deleted.`
                : `Message #${item.id} was already gone. Its visitor has dismissed it.`);
        }
    });
    return <section aria-labelledby="messages-heading" className="max-w-2xl">
        <h2 id="messages-heading" className="mb-2 text-3xl">Targeted message</h2>
        <p className="mb-5 text-sm text-[var(--muted-foreground)]">Send a note to a known session ID. Each session can have one pending message.</p>
        <Card>
            <Feedback error={task.error} notice={task.notice} />
            <form onSubmit={submit}>
                <fieldset disabled={task.busy} className="space-y-4">
                    <label className="block text-sm">Session ID<Input className="font-mono" required maxLength={256} autoComplete="off" value={sessionId} onChange={event => setSessionId(event.target.value)} /></label>
                    <label className="block text-sm">Message title (optional)<Input maxLength={120} placeholder="A note for you" value={title} onChange={event => setTitle(event.target.value)} /></label>
                    <label className="block text-sm">Message<Textarea className="min-h-40" required maxLength={4000} rows={6} value={message} onChange={event => setMessage(event.target.value)} /></label>
                    <Button type="submit" variant="secondary" disabled={!sessionId.trim() || !message.trim()}>{task.busy ? 'Sending…' : 'Send message'}</Button>
                </fieldset>
            </form>
        </Card>

        <div className="mb-3 mt-8 flex flex-wrap items-start justify-between gap-3">
            <div><h3 id="pending-messages-heading" className="text-2xl">Pending messages</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">Messages their visitor has not dismissed yet. Deleting one withdraws it unless it is already on their screen.</p></div>
            <Button variant="secondary" disabled={pending.busy} onClick={() => { setDeleting(null); void pending.reload(); }}>Refresh messages</Button>
        </div>
        <Feedback error={pending.error} notice={pending.notice} />
        {pending.busy && <p role="status" className="mb-3 text-sm">Updating messages…</p>}
        {pending.loaded && !pending.items.length && <EmptyState title="No pending messages." compact variant="card" />}
        {pending.items.length > 0 && <Card as="ul" padding="none" aria-labelledby="pending-messages-heading" className="divide-y divide-[var(--border)]">
            {pending.items.map(item => <li key={item.id} className="p-4">
                <p className="break-words font-medium">{item.title}</p>
                <p className="mb-2 [overflow-wrap:anywhere] text-xs text-[var(--muted-foreground)]">#{item.id} · <span className="font-mono">{item.sessionId}</span> · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></p>
                <p className="whitespace-pre-wrap break-words text-sm">{item.message}</p>
                <Button className="mt-3" variant="secondary" disabled={pending.busy || !!deleting} onClick={event => { deleteTrigger.current = event.currentTarget; setDeleting(item); }}>Delete message</Button>
                {deleting?.id === item.id && <Card className="mt-4 space-y-3">
                    <p className="text-sm">Delete message #{item.id}? A visitor who has it open can still read it.</p>
                    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={pending.busy} onClick={() => remove(item)}>Confirm delete</Button><Button variant="secondary" autoFocus disabled={pending.busy} onClick={() => { setDeleting(null); deleteTrigger.current?.focus(); }}>Cancel</Button></div>
                </Card>}
            </li>)}
        </Card>}
    </section>;
}
