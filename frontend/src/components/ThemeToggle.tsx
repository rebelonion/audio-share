import {Moon, Sun} from 'lucide-react';
import {useTheme} from '@/hooks/useTheme';
import {useRybbit} from '@/hooks/useRybbit';
import {buttonClass} from '@/components/ui/buttonStyles';

export default function ThemeToggle({className = ''}: {className?: string}) {
    const {theme, setTheme} = useTheme();
    const {track} = useRybbit();
    const next = theme === 'dark' ? 'light' : 'dark';
    const label = `${next === 'light' ? 'Light' : 'Dark'} mode`;

    return (
        <button
            type="button"
            onClick={() => {
                setTheme(next);
                track('theme-toggle', {theme: next});
            }}
            className={buttonClass({variant: 'subtle', size: 'xs', shape: 'pill', className: `border border-[var(--border)] uppercase tracking-[0.14em] hover:border-[var(--primary-border-hover)] ${className}`})}
            aria-label={`Switch to ${next} mode`}
        >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" /> : <Moon className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />}
            {label}
        </button>
    );
}
