import { Link } from 'react-router';
import { Search } from 'lucide-react';

export default function GlobalSearchBar() {
    return (
        <Link
            to="/search"
            className="text-[var(--foreground)] hover:text-[var(--primary)] transition-colors p-2"
            aria-label="Search"
            title="Search audio library"
        >
            <Search className="h-5 w-5" />
        </Link>
    );
}
