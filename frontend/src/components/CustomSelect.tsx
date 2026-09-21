import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
    value: string;
    label: string;
}

interface CustomSelectProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    options: CustomSelectOption[];
    disabled?: boolean;
    triggerClassName?: string;
    ariaLabel?: string;
    portal?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export default function CustomSelect({
    id,
    value,
    onChange,
    options,
    disabled = false,
    triggerClassName = '',
    ariaLabel,
    portal = true,
    onOpenChange,
}: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const generatedId = useId();
    const triggerId = id ?? generatedId;
    const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

    useEffect(() => {
        if (open) dropdownRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[activeIndex]?.focus();
    }, [open, activeIndex]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                !dropdownRef.current?.contains(e.target as Node) &&
                !triggerRef.current?.contains(e.target as Node)
            ) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    const handleOpen = () => {
        if (disabled) return;

        if (!open && triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            setPopoverStyle({ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 });
            setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
        }
        setOpen(v => !v);
    };

    const selected = options.find(o => o.value === value);

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        if (open && event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            triggerRef.current?.focus();
        } else if (open && event.key === 'Tab') {
            setOpen(false);
            triggerRef.current?.focus();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            if (!open && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            event.stopPropagation();
            if (!open) handleOpen();
            else if (event.key === 'Home') setActiveIndex(0);
            else if (event.key === 'End') setActiveIndex(options.length - 1);
            else setActiveIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
        }
    };

    const menu = (
        <div
            ref={dropdownRef}
            id={`${triggerId}-options`}
            style={portal ? popoverStyle : {position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '100%', zIndex: 1}}
            role="listbox"
            aria-labelledby={triggerId}
            className="bg-[var(--card)] border border-[var(--border)] rounded shadow-lg max-h-64 overflow-y-auto animate-fadeIn"
        >
            {options.map((opt, index) => (
                <button
                    key={opt.value}
                    type="button"
                    role="option"
                    tabIndex={activeIndex === index ? 0 : -1}
                    aria-selected={opt.value === value}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => { onChange(opt.value); setOpen(false); triggerRef.current?.focus(); }}
                    className={`w-full px-3 py-2 text-sm text-left whitespace-normal transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--primary)] ${
                        opt.value === value
                            ? 'text-[var(--primary)] bg-[var(--primary-tint)]'
                            : 'text-[var(--foreground)] hover:bg-[var(--card-hover)]'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );

    return (
        <div className="relative" onKeyDown={handleKeyDown}>
            <button
                id={triggerId}
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-controls={open ? `${triggerId}-options` : undefined}
                className={`w-full px-3 py-1.5 text-sm bg-[var(--secondary)] border rounded flex items-center justify-between gap-2 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    open ? 'border-[var(--primary)]' : 'border-[var(--border)] hover:border-[var(--primary-border-hover)]'
                } text-[var(--foreground)] ${triggerClassName}`}
            >
                <span className="text-left whitespace-normal">{selected?.label ?? ''}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (portal ? createPortal(menu, document.body) : menu)}
        </div>
    );
}
