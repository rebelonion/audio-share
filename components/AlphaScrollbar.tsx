'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileSystemItem } from '@/types';
import { ChevronUp, ChevronDown } from 'lucide-react';
import {useSearchParams} from "next/navigation";

interface AlphaScrollbarProps {
    items: FileSystemItem[];
    onScrollToLetterAction: (letter: string) => void;
}

export default function AlphaScrollbar({ items, onScrollToLetterAction }: AlphaScrollbarProps) {
    const searchParams = useSearchParams();
    const [availableLetters, setAvailableLetters] = useState<string[]>([]);
    const [activeLetter, setActiveLetter] = useState<string | null>(null);
    const desktopScrollbarRef = useRef<HTMLDivElement>(null);
    const mobileScrollbarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sortOrder = searchParams?.get('order') === 'desc' ? 'desc' : 'asc';
        
        const letters = items
            .map(item => item.name.charAt(0).toUpperCase())
            .filter((letter, index, self) => self.indexOf(letter) === index)
            .sort((a, b) => sortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b));

        setAvailableLetters(letters);
    }, [items, searchParams]);


    const handleLetterClick = useCallback((letter: string) => {
        setActiveLetter(letter);
        onScrollToLetterAction(letter);

        setTimeout(() => {
            setActiveLetter(null);
        }, 1000);
    }, [onScrollToLetterAction]);
    
    const scrollUp = useCallback(() => {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const scrollElement = isMobile ? mobileScrollbarRef.current : desktopScrollbarRef.current;
        if (scrollElement) {
            scrollElement.scrollBy({ top: -200, behavior: 'smooth' });
        }
    }, []);
    
    const scrollDown = useCallback(() => {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const scrollElement = isMobile ? mobileScrollbarRef.current : desktopScrollbarRef.current;
        if (scrollElement) {
            scrollElement.scrollBy({ top: 200, behavior: 'smooth' });
        }
    }, []);

    if (availableLetters.length <= 1) {
        return null; // Don't show scrollbar if there's only one or no letters
    }

    return (
        <>
            {/* Desktop scrollbar */}
            <div className="hidden md:block h-full">
                <div className="fixed right-3 top-1/2 transform -translate-y-1/2 z-30 flex flex-col items-center">
                    <button 
                        className="w-6 h-6 flex items-center justify-center bg-[var(--card)] rounded-lg shadow-lg mb-1 opacity-80 hover:opacity-100 transition-opacity hover:bg-[var(--card-hover)]"
                        onClick={scrollUp}
                        aria-label="Scroll up"
                    >
                        <ChevronUp size={16} />
                    </button>

                    <div 
                        ref={desktopScrollbarRef}
                        className="flex flex-col gap-1 bg-[var(--card)] rounded-lg shadow-lg p-1 max-h-[60vh] overflow-y-auto scrollbar-hide opacity-80 hover:opacity-100 transition-opacity"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {availableLetters.map(letter => (
                            <button
                                key={`desktop-${letter}`}
                                data-letter={letter}
                                className={`w-6 h-6 text-xs flex items-center justify-center rounded-md shrink-0 ${
                                    activeLetter === letter 
                                        ? 'bg-[var(--primary)] text-white' 
                                        : 'hover:bg-[var(--card-hover)] text-[var(--foreground)]'
                                }`}
                                onClick={() => handleLetterClick(letter)}
                            >
                                {letter}
                            </button>
                        ))}
                    </div>

                    <button 
                        className="w-6 h-6 flex items-center justify-center bg-[var(--card)] rounded-lg shadow-lg mt-1 opacity-80 hover:opacity-100 transition-opacity hover:bg-[var(--card-hover)]"
                        onClick={scrollDown}
                        aria-label="Scroll down"
                    >
                        <ChevronDown size={16} />
                    </button>
                </div>
            </div>
            
            {/* Mobile scrollbar */}
            <div className="md:hidden block">
                <div className="fixed top-1/2 right-1 transform -translate-y-1/2 z-30 flex flex-col items-center">
                    <button 
                        className="w-5 h-5 flex items-center justify-center bg-[var(--card)] rounded-lg shadow-lg mb-1 opacity-80 hover:opacity-100 transition-opacity hover:bg-[var(--card-hover)]"
                        onClick={scrollUp}
                        aria-label="Scroll up"
                    >
                        <ChevronUp size={12} />
                    </button>

                    <div
                        ref={mobileScrollbarRef}
                        className="flex flex-col gap-1 bg-[var(--card)] rounded-lg shadow-lg p-0.5 max-h-[60vh] overflow-y-auto scrollbar-hide opacity-80 hover:opacity-100 transition-opacity"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {availableLetters.map(letter => (
                            <button
                                key={`mobile-${letter}`}
                                data-letter={letter}
                                className={`w-5 h-5 text-[0.65rem] flex items-center justify-center rounded-md shrink-0 ${
                                    activeLetter === letter 
                                        ? 'bg-[var(--primary)] text-white' 
                                        : 'hover:bg-[var(--card-hover)] text-[var(--foreground)]'
                                }`}
                                onClick={() => handleLetterClick(letter)}
                            >
                                {letter}
                            </button>
                        ))}
                    </div>

                    <button 
                        className="w-5 h-5 flex items-center justify-center bg-[var(--card)] rounded-lg shadow-lg mt-1 opacity-80 hover:opacity-100 transition-opacity hover:bg-[var(--card-hover)]"
                        onClick={scrollDown}
                        aria-label="Scroll down"
                    >
                        <ChevronDown size={12} />
                    </button>
                </div>
            </div>
        </>
    );
}