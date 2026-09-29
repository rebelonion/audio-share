import type {ComponentProps, ReactNode} from 'react';

export default function SiteBanner({icon, action, children, className = 'border-[rgba(196,136,42,0.45)] bg-[rgba(35,29,19,0.96)] text-[var(--foreground)]', ...props}: ComponentProps<'section'> & {icon: ReactNode; action: ReactNode}) {
    return <section {...props} className={`border-b ${className}`}>
        <div className="px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-3">
                {icon}
                <div className="min-w-0 flex-1 text-sm leading-6">{children}</div>
                {action}
            </div>
        </div>
    </section>;
}
