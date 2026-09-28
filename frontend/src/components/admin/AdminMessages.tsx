import {useState, type FormEvent} from 'react';
import {sendTargetedMessage} from '@/lib/adminManagement';
import {buttonClass, inputClass, panelClass, Feedback} from './shared';
import {useAdminTask, type AuthFailure} from './useAdminTask';

export default function AdminMessages({onAuthFailure}: {onAuthFailure: AuthFailure}) {
    const [sessionId, setSessionId] = useState('');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const task = useAdminTask(onAuthFailure);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        void task.run(async signal => {
            const result = await sendTargetedMessage({sessionId: sessionId.trim(), title: title.trim(), message: message.trim()}, signal);
            if (!signal.aborted) {
                setSessionId(''); setTitle(''); setMessage('');
                task.setNotice(`Message #${result.id} queued for that session. It will appear when the visitor next checks for messages.`);
            }
        });
    };
    return <section aria-labelledby="messages-heading" className="max-w-2xl">
        <h2 id="messages-heading" className="mb-2 text-3xl">Targeted message</h2>
        <p className="mb-5 text-sm text-[var(--muted-foreground)]">Send a note to a known session ID. Each session can have one pending message.</p>
        <div className={panelClass}>
            <Feedback error={task.error} notice={task.notice} />
            <form onSubmit={submit}>
                <fieldset disabled={task.busy} className="space-y-4">
                    <label className="block text-sm">Session ID<input className={`${inputClass} font-mono`} required maxLength={256} autoComplete="off" value={sessionId} onChange={event => setSessionId(event.target.value)} /></label>
                    <label className="block text-sm">Message title (optional)<input className={inputClass} maxLength={120} placeholder="A note for you" value={title} onChange={event => setTitle(event.target.value)} /></label>
                    <label className="block text-sm">Message<textarea className={`${inputClass} min-h-40`} required maxLength={4000} rows={6} value={message} onChange={event => setMessage(event.target.value)} /></label>
                    <button className={buttonClass} disabled={!sessionId.trim() || !message.trim()}>{task.busy ? 'Sending…' : 'Send message'}</button>
                </fieldset>
            </form>
        </div>
    </section>;
}
