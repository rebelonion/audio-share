import {useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject} from 'react';
import {createPortal} from 'react-dom';

interface DialogProps {
    open: boolean;
    onClose: () => void;
    labelledBy: string;
    describedBy?: string;
    initialFocusRef?: RefObject<HTMLElement | null>;
    className?: string;
    children: ReactNode;
}

const openDialogs: HTMLElement[] = [];
let previousOverflow = '';
const previousInert = new Map<HTMLElement, boolean>();

function isolateTopDialog() {
    const top = openDialogs[openDialogs.length - 1];
    for (const child of document.body.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (!previousInert.has(child)) previousInert.set(child, child.hasAttribute('inert'));
        child.toggleAttribute('inert', top ? !child.contains(top) : previousInert.get(child));
    }
    if (!top) previousInert.clear();
}

function focusableControls(root: HTMLElement) {
    return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
        .filter(element => !element.matches(':disabled, [tabindex="-1"], input[type="hidden"]') && !element.closest('[hidden], [inert]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
}

export default function Dialog({open, onClose, labelledBy, describedBy, initialFocusRef, className = 'max-w-md', children}: DialogProps) {
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        if (!open || !root) return;
        const previousFocus = document.activeElement;
        if (openDialogs.length === 0) {
            previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        openDialogs.push(root);
        isolateTopDialog();
        const observer = new MutationObserver(isolateTopDialog);
        observer.observe(document.body, {childList: true});
        (initialFocusRef?.current ?? focusableControls(root)[0] ?? root).focus({preventScroll: true});

        return () => {
            observer.disconnect();
            const wasTop = openDialogs[openDialogs.length - 1] === root;
            openDialogs.splice(openDialogs.indexOf(root), 1);
            isolateTopDialog();
            if (openDialogs.length === 0) document.body.style.overflow = previousOverflow;
            if (wasTop && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({preventScroll: true});
        };
    }, [open, initialFocusRef]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const root = event.currentTarget;
        if (openDialogs[openDialogs.length - 1] !== root || event.defaultPrevented) return;
        event.stopPropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
        } else if (event.key === 'Tab') {
            const elements = focusableControls(root);
            const first = elements[0] ?? root;
            const last = elements[elements.length - 1] ?? root;
            if (!root.contains(document.activeElement) || document.activeElement === root || document.activeElement === (event.shiftKey ? first : last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        }
    };

    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
            onClick={event => {
                if (event.target === event.currentTarget && openDialogs[openDialogs.length - 1] === rootRef.current) {
                    event.stopPropagation();
                    onClose();
                }
            }}>
            <div ref={rootRef} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1}
                className={`max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] animate-fadeIn ${className}`}>
                {children}
            </div>
        </div>, document.body,
    );
}
