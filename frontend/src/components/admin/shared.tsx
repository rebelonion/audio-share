import Alert from '@/components/ui/Alert';
export function Feedback({error, notice}: {error: string; notice: string}) {
    return <>
        {error && <Alert className="mb-4 break-words">{error}</Alert>}
        {notice && <Alert variant="success" className="mb-4">{notice}</Alert>}
    </>;
}

export function SourceLink({url}: {url: string}) {
    // Older records can contain values that were not validated on insertion.
    const safe = /^https?:\/\//i.test(url);
    return safe ? <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-[var(--primary)] underline">{url}</a>
        : <span className="break-all text-xs text-[var(--muted-foreground)]">{url}</span>;
}
