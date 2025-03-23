import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbProps {
    path: string;
}

export default function Breadcrumb({ path }: BreadcrumbProps) {
    const segments = path ? path.split('/').filter(Boolean) : [];

    return (
        <nav className="flex items-center space-x-1 text-sm text-[var(--muted-foreground)] mb-4">
            <Link 
                href="/" 
                className="flex items-center text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors duration-200"
            >
                <Home className="h-4 w-4 mr-1" />
                <span>Home</span>
            </Link>

            {segments.map((segment, index) => {
                const segmentPath = '/' + segments.slice(0, index + 1).map((segment) => {
                    return `${encodeURIComponent(segment)}`;
                }).join('/');
                return (
                    <div key={segmentPath} className="flex items-center">
                        <ChevronRight className="h-4 w-4 mx-1 text-[var(--muted)]" />
                        <Link
                            href={`/browse${segmentPath}`}
                            className={index === segments.length - 1
                                ? "font-medium text-[var(--foreground)]"
                                : "text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors duration-200"
                            }
                        >
                            {decodeURIComponent(segment)}
                        </Link>
                    </div>
                );
            })}
        </nav>
    );
}