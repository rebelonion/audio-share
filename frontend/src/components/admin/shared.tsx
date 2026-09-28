export const buttonClass = 'inline-flex items-center justify-center rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--card-hover)] disabled:opacity-50';
export const inputClass = 'w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm';
export const panelClass = 'rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6';
export function Feedback({error, notice}: {error: string; notice: string}) {
    return <>
        {error && <p role="alert" className="mb-4 break-words rounded-md border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]">{error}</p>}
        {notice && <p role="status" className="mb-4 text-sm text-[var(--success-text)]">{notice}</p>}
    </>;
}

export function SourceLink({url}: {url: string}) {
    // Older records can contain values that were not validated on insertion.
    const safe = /^https?:\/\//i.test(url);
    return safe ? <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-[var(--primary)] underline">{url}</a>
        : <span className="break-all text-xs text-[var(--muted-foreground)]">{url}</span>;
}

export function Pagination({page, total, onPage}: {page: number; total: number; onPage: (page: number) => void}) {
    const pages = Math.max(1, Math.ceil(total / 25));
    return <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <button className={buttonClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages} · {total} results</span>
        <button className={buttonClass} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>;
}
