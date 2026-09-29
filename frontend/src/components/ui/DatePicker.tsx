import {useId, useRef, useState} from 'react';
import {Calendar, ChevronDown, ChevronLeft, ChevronRight, X} from 'lucide-react';
import {Button, IconButton} from './Button';
import Dialog from './Dialog';
import {controlClass, sizes} from './fieldStyles';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function dateLabel(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return `${MONTHS[month - 1]} ${day}, ${year}`;
}

interface DatePickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}

export default function DatePicker({value, onChange, placeholder}: DatePickerProps) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<'days' | 'months'>('days');
    const [period, setPeriod] = useState(() => new Date());
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const year = period.getFullYear();
    const month = period.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    function showCalendar() {
        const [selectedYear, selectedMonth] = value.split('-').map(Number);
        setPeriod(value ? new Date(selectedYear, selectedMonth - 1, 1) : new Date());
        setView('days');
        triggerRef.current?.focus();
        setOpen(true);
    }

    function changePeriod(direction: number) {
        setPeriod(new Date(year + (view === 'months' ? direction : 0), month + (view === 'days' ? direction : 0), 1));
    }

    return <div className="flex min-w-0 flex-1 items-center gap-1">
        <button ref={triggerRef} type="button" onClick={showCalendar}
            aria-label={value ? `${placeholder}: ${dateLabel(value)}` : placeholder}
            aria-haspopup="dialog" aria-expanded={open}
            className={`${controlClass} ${sizes.sm} flex items-center justify-between gap-2`}>
            <span className="flex min-w-0 items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{value ? dateLabel(value) : placeholder}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
        {value && <IconButton size="sm" aria-label={`Clear ${placeholder.toLowerCase()} date`} onClick={() => {
            onChange('');
            triggerRef.current?.focus();
        }}><X className="h-3.5 w-3.5" /></IconButton>}
        <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} className="max-w-xs p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id={titleId} className="text-lg font-semibold">{placeholder} date</h2>
                <IconButton ref={closeRef} aria-label="Close calendar" onClick={() => setOpen(false)}><X className="h-4 w-4" /></IconButton>
            </div>
            <div className="mb-3 flex items-center justify-between gap-1">
                <IconButton aria-label={view === 'days' ? 'Previous month' : 'Previous year'} onClick={() => changePeriod(-1)}><ChevronLeft className="h-4 w-4" /></IconButton>
                <Button variant="ghost" size="sm" aria-label={view === 'days' ? 'Choose month' : 'Choose day'} onClick={() => setView(view === 'days' ? 'months' : 'days')}>
                    <span aria-live="polite">{view === 'days' ? `${MONTHS[month]} ${year}` : year}</span>
                </Button>
                <IconButton aria-label={view === 'days' ? 'Next month' : 'Next year'} onClick={() => changePeriod(1)}><ChevronRight className="h-4 w-4" /></IconButton>
            </div>
            {view === 'months' ? <div className="grid grid-cols-3 gap-1">
                {MONTHS.map((name, index) => <Button key={name} size="sm" variant={index === month ? 'selected' : 'ghost'} aria-label={`${name} ${year}`} onClick={() => {
                    setPeriod(new Date(year, index, 1));
                    setView('days');
                    closeRef.current?.focus();
                }}>{name.slice(0, 3)}</Button>)}
            </div> : <>
                <div aria-hidden="true" className="mb-1 grid grid-cols-7 text-center text-xs text-[var(--muted-foreground)]">
                    {DAYS.map(day => <span key={day}>{day}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                    {Array.from({length: firstDay}, (_, index) => <span key={`empty-${index}`} />)}
                    {Array.from({length: daysInMonth}, (_, index) => {
                        const day = index + 1;
                        const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                        return <IconButton key={day} variant={iso === value ? 'selected' : 'ghost'} aria-label={dateLabel(iso)}
                            aria-pressed={iso === value} aria-current={isToday ? 'date' : undefined} onClick={() => {
                                onChange(iso);
                                setOpen(false);
                            }}>{day}</IconButton>;
                    })}
                </div>
            </>}
        </Dialog>
    </div>;
}
