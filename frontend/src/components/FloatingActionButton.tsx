import {useEffect, useState, type CSSProperties} from 'react';
import {useLocation} from 'react-router';
import {ListPlus} from 'lucide-react';
import RequestSourceDialog from './RequestSourceDialog';
import {useRybbit} from '@/hooks/useRybbit';
import {calculateFooterClearance} from '@/lib/footerClearance';

export default function FloatingActionButton() {
    const {track} = useRybbit();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [footerClearance, setFooterClearance] = useState<number | null>(null);
    const location = useLocation();
    const isRequestsPage = location.pathname === '/requests';

    useEffect(() => {
        const footer = document.querySelector('footer');
        const main = document.querySelector('main');
        if (!footer || !main) return;

        let frameId: number | null = null;
        const updatePosition = () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                const footerTop = footer.getBoundingClientRect().top;
                setFooterClearance(calculateFooterClearance(footerTop, window.innerHeight));
                frameId = null;
            });
        };

        const resizeObserver = new ResizeObserver(updatePosition);
        resizeObserver.observe(footer);
        resizeObserver.observe(main);
        window.addEventListener('scroll', updatePosition, {passive: true});
        window.addEventListener('resize', updatePosition);
        updatePosition();

        return () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            window.removeEventListener('scroll', updatePosition);
            window.removeEventListener('resize', updatePosition);
        };
    }, [location.key]);

    return (
        <>
            <button
                onClick={() => {
                    setIsDialogOpen(true);
                    track('artist-request-dialog-open');
                }}
                className={`floating-action-button ${footerClearance !== null ? 'footer-is-near' : ''} fixed bottom-6 left-6 bg-[var(--primary)] text-white shadow-lg hover:bg-[var(--primary-hover)] z-10 flex items-center justify-center transition-all duration-300 ${isRequestsPage ? 'px-5 py-3 rounded-full gap-2' : 'p-3 rounded-full'}`}
                style={footerClearance === null ? undefined : {'--footer-clearance': `${footerClearance}px`} as CSSProperties}
                title="Request new artist"
                aria-label="Request new artist"
            >
                <ListPlus className="pl-1 h-7 w-7 flex-shrink-0"/>
                {isRequestsPage && <span className="text-sm font-medium pr-1">Request a source</span>}
            </button>

            <RequestSourceDialog
                isOpen={isDialogOpen}
                onCloseAction={() => setIsDialogOpen(false)}
            />
        </>
    );
}
