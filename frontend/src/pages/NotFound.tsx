import { Link } from 'react-router'
import { Helmet } from 'react-helmet-async'
import { DEFAULT_TITLE } from '@/lib/config'

export default function NotFound() {
    return (
        <>
            <Helmet>
                <title>Page Not Found - {DEFAULT_TITLE}</title>
            </Helmet>
            <div className="flex flex-col items-center justify-center py-24 animate-fadeIn">
                <h1 className="text-6xl font-bold text-[var(--primary)] mb-4">404</h1>
                <p className="text-xl text-[var(--foreground)] mb-2">Page not found</p>
                <p className="text-[var(--muted-foreground)] mb-8">
                    The page you're looking for doesn't exist or has been moved.
                </p>
                <Link
                    to="/"
                    className="px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-lg transition-colors font-medium"
                >
                    Back to Home
                </Link>
            </div>
        </>
    )
}
