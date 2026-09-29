import {Input} from '@/components/ui/Field';
import {Loader2, Search, X} from 'lucide-react';
import type {Ref} from 'react';
import {IconButton} from '@/components/ui/Button';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    loading?: boolean;
    size?: 'md' | 'lg';
    ref?: Ref<HTMLInputElement>;
}

export default function SearchBar({value, onChange, placeholder = 'Filter current directory...', label = 'Filter current directory', loading = false, size = 'md', ref}: SearchBarProps) {
    return <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
        <Input variant="search" fieldSize={size} ref={ref} type="text" aria-label={label} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}
            className={`pl-10 ${loading && value ? 'pr-20' : loading || value ? 'pr-12' : 'pr-3'}`} />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {loading && <span role="status" aria-label="Searching"><Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" aria-hidden="true" /></span>}
            {value && <IconButton size="sm" aria-label="Clear search" onClick={() => onChange('')}><X className="h-4 w-4" /></IconButton>}
        </div>
    </div>;
}
