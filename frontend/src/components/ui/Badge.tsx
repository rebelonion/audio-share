import type {ComponentProps} from 'react';

export default function Badge({size = 'md', variant = 'default', className = '', ...props}: ComponentProps<'span'> & {size?: 'sm' | 'md'; variant?: 'default' | 'overlay'}) {
    return <span {...props} className={`inline-flex shrink-0 items-center gap-1 rounded border py-0.5 font-semibold ${variant === 'overlay' ? 'border-amber-400/50 bg-black/75 text-amber-300' : 'border-amber-500/40 text-amber-500'} ${size === 'sm' ? 'px-1.5 text-[10px]' : 'px-2 text-xs'} ${className}`} />;
}
