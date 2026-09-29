import type {ComponentProps} from 'react';
import {ArrowDown, ArrowUp, ArrowUpDown} from 'lucide-react';

interface SortableHeaderProps extends ComponentProps<'th'> {
    direction?: 'asc' | 'desc';
    onSort: () => void;
    align?: 'left' | 'center';
}

export default function SortableHeader({direction, onSort, align = 'center', children, className = '', ...props}: SortableHeaderProps) {
    const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
    return <th {...props} scope="col" aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
        className={`text-xs font-medium text-[var(--muted-foreground)] ${className}`}>
        <button type="button" onClick={onSort}
            className={`flex w-full items-center gap-1.5 px-6 py-3 uppercase tracking-wider hover:text-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)] ${align === 'left' ? 'justify-start' : 'justify-center'}`}>
            {children}<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
    </th>;
}
