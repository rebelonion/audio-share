import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
}

export default function CustomSelect({
    id,
    value,
    onChange,
    options,
    disabled = false,
    triggerClassName = '',
}: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
        }
        setOpen(v => !v);
    };

    const selected = options.find(o => o.value === value);

    return (
        <div className="relative">
            <button
                id={id}
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={`w-full px-3 py-1.5 text-sm bg-[var(--secondary)] border rounded flex items-center justify-between gap-2 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    open ? 'border-[var(--primary)]' : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                } text-[var(--foreground)] ${triggerClassName}`}
            >
                <span>{selected?.label ?? ''}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && createPortal(
                <div
                    ref={dropdownRef}
                    style={popoverStyle}
                    role="listbox"
                    className="bg-[var(--card)] border border-[var(--border)] rounded shadow-lg overflow-hidden animate-fadeIn"
                >
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            role="option"
                            aria-selected={opt.value === value}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                                opt.value === value
                                    ? 'text-[var(--primary)] bg-[var(--primary)]/10'
                                    : 'text-[var(--foreground)] hover:bg-[var(--card-hover)]'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}
