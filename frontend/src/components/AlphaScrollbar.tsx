import { useCallback, useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface AlphaScrollbarProps {
    letters: string[];
    onScrollToLetterAction: (letter: string) => void;
}

export default function AlphaScrollbar({ letters, onScrollToLetterAction }: AlphaScrollbarProps) {
    const [activeLetter, setActiveLetter] = useState<string | null>(null);
    const scrollbarRef = useRef<HTMLDivElement>(null);

    const handleLetterClick = useCallback((letter: string) => {
        setActiveLetter(letter);
        onScrollToLetterAction(letter);

        setTimeout(() => {
            setActiveLetter(null);
        }, 1000);
    }, [onScrollToLetterAction]);

    const scrollUp = useCallback(() => {
        if (scrollbarRef.current) {
            scrollbarRef.current.scrollBy({ top: -200, behavior: 'smooth' });
        }
    }, []);

    const scrollDown = useCallback(() => {
        if (scrollbarRef.current) {
            scrollbarRef.current.scrollBy({ top: 200, behavior: 'smooth' });
        }
    }, []);

    if (letters.length <= 1) {
        return null;
    }

    return (
        <div className="flex flex-col items-center">
            <button
                className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-[var(--card)] rounded-lg shadow-lg mb-1 opacity-80 hover:opacity-100 transition-opacity hover:bg-[var(--card-hover)]"
                onClick={scrollUp}
                aria-label="Scroll up"
            >
                <ChevronUp size={12} />
            </button>

            <div
                ref={scrollbarRef}
                className="flex flex-col gap-1 bg-[var(--card)] rounded-lg shadow-lg p-0.5 md:p-1 max-h-[60vh] overflow-y-auto scrollbar-hide opacity-80 hover:opacity-100 transition-opacity"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {letters.map(letter => (
                    <button
                        key={letter}
                        data-letter={letter}
                        className={`w-5 h-5 md:w-6 md:h-6 text-[0.65rem] md:text-xs flex items-center justify-center rounded-md shrink-0 ${
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
                className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center bg-[var(--card)] rounded-lg shadow-lg mt-1 opacity-80 hover:opacity-100 transition-opacity hover:bg-[var(--card-hover)]"
                onClick={scrollDown}
                aria-label="Scroll down"
            >
                <ChevronDown size={12} />
            </button>
        </div>
    );
}
