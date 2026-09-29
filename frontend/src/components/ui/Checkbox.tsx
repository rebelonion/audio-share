import type {ComponentProps} from 'react';
import {Check} from 'lucide-react';

export default function Checkbox({className = '', ...props}: Omit<ComponentProps<'input'>, 'type'>) {
    return <span className={`relative inline-flex h-5 w-5 shrink-0 ${className}`}>
        <input {...props} type="checkbox" className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
        <span aria-hidden="true" className="pointer-events-none flex h-full w-full items-center justify-center rounded border border-[var(--border)] bg-[var(--card)] text-transparent transition-colors peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary)] peer-checked:text-[var(--primary-foreground)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--primary)] peer-disabled:opacity-50">
            <Check className="h-3.5 w-3.5" />
        </span>
    </span>;
}
