import { Search, X } from 'lucide-react';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search current directory...' }: SearchBarProps) {
    return (
        <div className="relative w-full px-0.5">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <Search className="w-4 h-4 text-[var(--muted-foreground)]" />
            </div>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-10 pr-10 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] transition-colors"
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 hover:bg-[var(--card-hover)] rounded p-0.5 transition-colors"
                    aria-label="Clear search"
                >
                    <X className="w-4 h-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" />
                </button>
            )}
        </div>
    );
}
