import {useState} from 'react';
import {useLocation} from 'react-router';
import {ListPlus} from 'lucide-react';
import RequestSourceDialog from './RequestSourceDialog';
import {useUmami} from '@/hooks/useUmami';

export default function FloatingActionButton() {
    const {track} = useUmami();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const location = useLocation();
    const isRequestsPage = location.pathname === '/requests';

    return (
        <>
            <button
                onClick={() => {
                    setIsDialogOpen(true);
                    track('artist-request-dialog-open');
                }}
                className={`fixed bottom-6 left-6 bg-[var(--primary)] text-white shadow-lg hover:bg-[var(--primary-hover)] z-10 flex items-center justify-center transition-all duration-300 ${isRequestsPage ? 'px-5 py-3 rounded-full gap-2' : 'p-3 rounded-full'}`}
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
