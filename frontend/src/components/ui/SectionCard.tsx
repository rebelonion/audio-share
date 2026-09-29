import Card from './Card';
import {useId, type ReactNode} from 'react';

export default function SectionCard({title, description, children}: {title: string; description?: string; children: ReactNode}) {
    const titleId = useId();
    return <Card as="section" aria-labelledby={titleId} className="mb-8 shadow-lg sm:mb-12">
        <h2 id={titleId} className="mb-4 flex items-center gap-3 text-xl font-bold text-[var(--foreground)] sm:text-2xl">
            <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-sm bg-[var(--primary)] opacity-80 sm:h-6" />
            {title}
        </h2>
        {description && <p className="mb-5 text-sm text-[var(--muted-foreground)]">{description}</p>}
        {children}
    </Card>;
}
