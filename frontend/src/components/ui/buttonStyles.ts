const variants = {
    primary: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]',
    secondary: 'border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--card-hover)]',
    selected: 'border border-[var(--primary)] bg-[var(--primary-selected)] text-[var(--primary)] hover:bg-[var(--primary-selected-hover)]',
    subtle: 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--muted)]',
    danger: 'border border-[var(--error-border)] text-[var(--error-text)] hover:bg-[var(--error-bg)]',
    link: 'text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline underline-offset-2',
    ghost: 'text-[var(--muted-foreground)] hover:bg-[var(--card-hover)] hover:text-[var(--foreground)]',
};

export interface ButtonStyleProps {
    variant?: keyof typeof variants;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const focusClass = 'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 [&:disabled_*]:pointer-events-none';

export function buttonClass({variant = 'primary', size = 'md', className = ''}: ButtonStyleProps) {
    return `inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ${focusClass} ${variants[variant]} ${variant === 'link' ? 'p-0' : size === 'sm' ? 'px-3 py-1.5' : size === 'lg' ? 'px-4 py-3' : 'px-4 py-2'} ${className}`;
}

export function iconButtonClass({variant = 'ghost', size = 'md', className = ''}: ButtonStyleProps) {
    return `inline-flex shrink-0 items-center justify-center rounded-full ${focusClass} ${variants[variant]} ${size === 'sm' ? 'h-9 w-9 sm:h-7 sm:w-7' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'} ${className}`;
}
