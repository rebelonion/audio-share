import {ChevronLeft, ChevronRight} from 'lucide-react';
import {Button} from './Button';

interface PaginationProps {
    page: number;
    pages: number;
    onPage: (page: number) => void;
    total?: number;
    numbered?: boolean;
    disabled?: boolean;
    className?: string;
}

export default function Pagination({page, pages, onPage, total, numbered = false, disabled = false, className = ''}: PaginationProps) {
    const firstPage = Math.max(1, Math.min(page - 2, pages - 4));
    return <nav aria-label="Pagination" className={`flex flex-wrap items-center justify-center gap-2 text-sm ${className}`}>
        <Button variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Previous</span>
        </Button>
        {numbered ? <div className="flex gap-1">
            {Array.from({length: Math.min(5, pages)}, (_, index) => firstPage + index).map(number =>
                <Button key={number} size="sm" variant={number === page ? 'selected' : 'secondary'}
                    aria-label={`Page ${number}`} aria-current={number === page ? 'page' : undefined}
                    disabled={disabled} onClick={() => onPage(number)}>{number}</Button>)}
        </div> : <span>Page {page} of {pages}{total !== undefined && ` · ${total} results`}</span>}
        <Button variant="secondary" size="sm" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} aria-label="Next">
            <span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
    </nav>;
}
