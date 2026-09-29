import type {ComponentProps} from 'react';

const variants = {
    error: 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)]',
    success: 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)]',
    warning: 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]',
    info: 'border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]',
};

export default function Alert({variant = 'error', size = 'md', className = '', ...props}: ComponentProps<'div'> & {variant?: keyof typeof variants; size?: 'sm' | 'md'}) {
    return <div role={variant === 'error' ? 'alert' : 'status'} {...props} className={`rounded-md border ${size === 'sm' ? 'p-2 text-xs' : 'p-4 text-sm'} ${variants[variant]} ${className}`} />;
}
