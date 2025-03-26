'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FileSystemItem } from '@/types';

interface AlphaScrollbarProps {
    items: FileSystemItem[];
    onScrollToLetterAction: (letter: string) => void;
}

export default function AlphaScrollbar({ items, onScrollToLetterAction }: AlphaScrollbarProps) {
    const [availableLetters, setAvailableLetters] = useState<string[]>([]);
    const [activeLetter, setActiveLetter] = useState<string | null>(null);
    const [isTouching, setIsTouching] = useState(false);

    useEffect(() => {
        const letters = items
            .map(item => item.name.charAt(0).toUpperCase())
            .filter((letter, index, self) => self.indexOf(letter) === index)
            .sort((a, b) => a.localeCompare(b));

        setAvailableLetters(letters);
    }, [items]);

    const handleLetterClick = useCallback((letter: string) => {
        setActiveLetter(letter);
        onScrollToLetterAction(letter);

        setTimeout(() => {
            setActiveLetter(null);
        }, 1000);
    }, [onScrollToLetterAction]);
    
    const handleTouchStart = useCallback((letter: string) => {
        setIsTouching(true);
        setActiveLetter(letter);
        onScrollToLetterAction(letter);
    }, [onScrollToLetterAction]);
    
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isTouching) return;
        
        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        
        if (element && element.hasAttribute('data-letter')) {
            const letter = element.getAttribute('data-letter');
            if (letter && letter !== activeLetter) {
                setActiveLetter(letter);
                onScrollToLetterAction(letter);
            }
        }
    }, [isTouching, activeLetter, onScrollToLetterAction]);
    
    const handleTouchEnd = useCallback(() => {
        setIsTouching(false);
        setTimeout(() => {
            setActiveLetter(null);
        }, 500);
    }, []);

    if (availableLetters.length <= 1) {
        return null; // Don't show scrollbar if there's only one or no letters
    }

    return (
        <>
            {/* Desktop scrollbar */}
            <div className="hidden md:block h-full">
                <div 
                    className="flex flex-col gap-1 bg-[var(--card)] rounded-lg shadow-lg p-1 sticky top-0 float-right ml-3 max-h-[70vh] overflow-y-auto scrollbar-hide"
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
            </div>
            
            {/* Mobile scrollbar */}
            <div className="md:hidden block">
                <div
                    className="flex flex-col gap-1 bg-[var(--card)] rounded-lg shadow-lg p-0.5 sticky top-0 float-right mr-2 max-h-[70vh] overflow-y-auto z-30 scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
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
                            onTouchStart={() => handleTouchStart(letter)}
                        >
                            {letter}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}