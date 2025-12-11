'use client';

import React, {useState} from 'react';
import {ListPlus} from 'lucide-react';
import RequestSourceDialog from './RequestSourceDialog';

export default function FloatingActionButton() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsDialogOpen(true)}
                className="fixed bottom-6 left-6 p-3 bg-[var(--primary)] text-white rounded-full shadow-lg hover:bg-[var(--primary-hover)] z-10 flex items-center justify-center"
                title="Request new artist"
                aria-label="Request new artist"
            >
                <ListPlus className="pl-1 h-7 w-7"/>
            </button>

            <RequestSourceDialog
                isOpen={isDialogOpen}
                onCloseAction={() => setIsDialogOpen(false)}
            />
        </>
    );
}