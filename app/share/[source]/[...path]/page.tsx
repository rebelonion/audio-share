'use client';

import React, { useEffect, useState, use } from 'react';
import { Share2, Home, Music } from 'lucide-react';
import SharePagePlayer from '@/components/SharePagePlayer';
import Link from 'next/link';

interface SharePageProps {
    params: Promise<{
        source: string;
        path: string[];
    }>;
}

export default function SharePage({ params }: SharePageProps) {
    const [notFound, setNotFound] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    const resolvedParams = use(params);
    const source = resolvedParams.source;
    const pathSegments = resolvedParams.path;
    const encodedPath = pathSegments.join('/');
    const apiAudioPath = `/api/audio/${source}/${encodedPath}`;
    useEffect(() => {
        const checkFile = async () => {
            try {
                const response = await fetch(apiAudioPath, { method: 'HEAD' });
                if (!response.ok) {
                    setNotFound(true);
                }
            } catch (error) {
                console.error('Error checking file:', error);
                setNotFound(true);
            } finally {
                setIsLoading(false);
            }
        };
        
        checkFile().then();
    }, [apiAudioPath]);
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--primary)] mb-4"></div>
                <h1 className="text-xl font-semibold">Loading audio...</h1>
            </div>
        );
    }
    
    if (notFound) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
                <div className="text-red-500 mb-4">
                    <Music className="h-16 w-16 mx-auto" />
                </div>
                <h1 className="text-xl font-semibold mb-2">Audio not found</h1>
                <p className="text-[var(--muted-foreground)] mb-6 text-center">
                    The audio file you&#39;re looking for might have been removed or doesn&#39;t exist.
                </p>
                <Link 
                    href="/"
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors"
                >
                    <Home className="h-4 w-4" />
                    Go to home page
                </Link>
            </div>
        );
    }
    
    return (
        <div className="container mx-auto p-4 max-w-4xl">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg p-6 mb-8">
                <Link href="/">
                    <h1 className="text-2xl font-bold mb-6 break-words line-clamp-4 hover:text-[var(--primary)] transition-colors cursor-pointer">
                        {decodeURIComponent(pathSegments[pathSegments.length - 1])}
                    </h1>
                </Link>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                    <p className="text-[var(--muted-foreground)] mb-4 md:mb-0">
                        From directory: <span className="font-medium">{source}</span>
                    </p>
                    
                    <Link
                        href="/"
                        className="px-4 py-2 bg-[var(--card-hover)] hover:bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-md flex items-center gap-2 transition-colors"
                    >
                        <Home className="h-5 w-5" />
                        <span className="font-medium">Browse Library</span>
                    </Link>
                </div>
                
                <div className="mb-8">
                    <p className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <Share2 className="h-5 w-5" />
                        Share this page to let others play this audio file
                    </p>
                </div>
                
                <div className="bg-[var(--card-hover)]/40 rounded-lg p-6">
                    <SharePagePlayer src={`/audio/${source}/${encodedPath}`} />
                </div>
            </div>
        </div>
    );
}