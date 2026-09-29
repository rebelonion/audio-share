import type {ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import Card from './Card';

interface EmptyStateProps {
    title: string;
    icon?: LucideIcon;
    children?: ReactNode;
    action?: ReactNode;
    variant?: 'plain' | 'card' | 'dashed';
    compact?: boolean;
    className?: string;
}

export default function EmptyState({title, icon: Icon, children, action, variant = 'plain', compact = false, className = ''}: EmptyStateProps) {
    const content = <>
        {Icon && <Icon aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-[var(--muted-foreground)]" />}
        {compact ? <p className="text-sm text-[var(--muted-foreground)]">{title}</p> : <h2 className="text-xl font-semibold">{title}</h2>}
        {children && <p className="mt-2 text-sm text-[var(--muted-foreground)]">{children}</p>}
        {action && <div className="mt-5">{action}</div>}
    </>;
    const classes = `text-center ${compact ? 'px-4 py-8' : 'px-4 py-12'} ${className}`;
    return variant === 'plain' ? <div className={classes}>{content}</div>
        : <Card padding="none" className={`${variant === 'dashed' ? 'border-dashed' : ''} ${classes}`}>{content}</Card>;
}
