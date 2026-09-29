import type {HTMLAttributes} from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
    as?: 'div' | 'section' | 'form' | 'ul' | 'p';
    padding?: 'none' | 'md' | 'lg';
}

export default function Card({as: Element = 'div', padding = 'md', className = '', ...props}: CardProps) {
    return <Element {...props} className={`rounded-lg border border-[var(--border)] bg-[var(--card)] ${padding === 'lg' ? 'p-6 sm:p-8' : padding === 'md' ? 'p-4 sm:p-6' : ''} ${className}`} />;
}
