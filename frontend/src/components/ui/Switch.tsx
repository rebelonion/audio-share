import type {ReactNode} from 'react';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: ReactNode;
    disabled?: boolean;
    className?: string;
}

export default function Switch({checked, onChange, children, disabled = false, className = ''}: SwitchProps) {
    return <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={`inline-flex items-center gap-2.5 rounded-md text-left text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
        <span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}`}>
            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
        </span>
        <span className="switch-label flex min-w-0 items-center gap-1.5">{children}</span>
    </button>;
}
