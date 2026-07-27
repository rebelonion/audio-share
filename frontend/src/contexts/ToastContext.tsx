import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {createPortal} from 'react-dom';
import {Check, TriangleAlert} from 'lucide-react';

type ToastVariant = 'success' | 'error';

type ToastRecord = {
    id: number;
    message: string;
    variant: ToastVariant;
};

type ToastAPI = {
    success: (message: string) => void;
    error: (message: string) => void;
};

const MAX_TOASTS = 4;
const TOAST_DURATION: Record<ToastVariant, number> = {
    success: 2_000,
    error: 5_000,
};

const ToastContext = createContext<ToastAPI | null>(null);

let nextToastID = 1;

function ToastItem({toast, onExpire}: {toast: ToastRecord; onExpire: (id: number) => void}) {
    useEffect(() => {
        const timer = window.setTimeout(() => onExpire(toast.id), TOAST_DURATION[toast.variant]);
        return () => window.clearTimeout(timer);
    }, [onExpire, toast.id, toast.variant]);

    const isError = toast.variant === 'error';

    return (
        <div
            className={`pointer-events-auto flex w-fit max-w-[calc(100vw-2rem)] items-start gap-2 rounded-full border px-3 py-2 text-xs shadow-lg animate-fadeIn ${
                isError
                    ? 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)]'
                    : 'border-[var(--primary-border)] bg-[var(--card)] text-[var(--foreground)]'
            }`}
            role={isError ? 'alert' : 'status'}
            aria-atomic="true"
        >
            {isError
                ? <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                : <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]"/>
            }
            <span className="min-w-0 whitespace-normal break-words">{toast.message}</span>
        </div>
    );
}

function ToastViewport({toasts, onExpire}: {toasts: ToastRecord[]; onExpire: (id: number) => void}) {
    return (
        <div
            className="pointer-events-none fixed top-4 left-1/2 z-[90] flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2"
            aria-live="polite"
            aria-relevant="additions"
        >
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onExpire={onExpire}/>
            ))}
        </div>
    );
}

export function ToastProvider({children}: PropsWithChildren) {
    const [toasts, setToasts] = useState<ToastRecord[]>([]);

    const removeToast = useCallback((id: number) => {
        setToasts(current => current.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback((variant: ToastVariant, message: string) => {
        const toast: ToastRecord = {
            id: nextToastID++,
            message,
            variant,
        };
        setToasts(current => [...current, toast].slice(-MAX_TOASTS));
    }, []);

    const api = useMemo<ToastAPI>(() => ({
        success: message => addToast('success', message),
        error: message => addToast('error', message),
    }), [addToast]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            {typeof document !== 'undefined' && createPortal(
                <ToastViewport toasts={toasts} onExpire={removeToast}/>,
                document.body,
            )}
        </ToastContext.Provider>
    );
}

export function useToast(): ToastAPI {
    const toast = useContext(ToastContext);
    if (!toast) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return toast;
}
