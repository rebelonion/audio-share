import {controlClass, sizes} from '@/components/ui/fieldStyles';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
    value: string;
    label: string;
}

interface CustomSelectProps {
    id?: string;
    fieldSize?: keyof typeof sizes;
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
    fieldSize = 'sm',
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
    const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({position: 'fixed'});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

    useLayoutEffect(() => {
        if (!open || !portal) return;
        const positionMenu = () => {
            const trigger = triggerRef.current;
            const menu = dropdownRef.current;
            if (!trigger || !menu) return;
            const rect = trigger.getBoundingClientRect();
            const below = window.innerHeight - rect.bottom - 12;
            const above = rect.top - 12;
            const height = Math.min(256, menu.scrollHeight);
            const opensAbove = below < height && above > below;
            const maxHeight = Math.max(0, Math.min(256, opensAbove ? above : below));
            setPopoverStyle({position: 'fixed', zIndex: 9999,
                top: opensAbove ? rect.top - Math.min(height, maxHeight) - 4 : rect.bottom + 4,
                left: rect.left, width: rect.width, maxHeight});
        };
        positionMenu();
        window.addEventListener('resize', positionMenu);
        window.addEventListener('scroll', positionMenu, true);
        return () => {
            window.removeEventListener('resize', positionMenu);
            window.removeEventListener('scroll', positionMenu, true);
        };
    }, [open, portal]);

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

        if (!open) {
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
                            ? 'text-[var(--primary)] bg-[var(--primary-selected)]'
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
                className={`${controlClass} ${sizes[fieldSize]} flex items-center justify-between gap-2 ${open ? 'ring-2 ring-[var(--primary)]' : 'hover:border-[var(--primary-border-hover)]'} ${triggerClassName}`}
            >
                <span className="text-left whitespace-normal">{selected?.label ?? ''}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (portal ? createPortal(menu, triggerRef.current?.closest('[role="dialog"]') ?? document.body) : menu)}
        </div>
    );
}
