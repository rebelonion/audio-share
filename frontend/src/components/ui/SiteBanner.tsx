import type {ComponentProps, ReactNode} from 'react';

export const infoBannerClass = 'border-[var(--banner-info-border)] bg-[var(--banner-info-bg)] text-[var(--foreground)]';

export default function SiteBanner({icon, action, children, className = infoBannerClass, ...props}: ComponentProps<'section'> & {icon: ReactNode; action: ReactNode}) {
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
