import {useLayoutEffect, useRef, useState, type CSSProperties} from 'react';

interface MarqueeTextProps {
    text: string;
    className?: string;
}

const GAP_PX = 32;
const SPEED_PX_PER_SECOND = 30;
const MIN_DURATION_SECONDS = 8;

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Single-line text that truncates when it fits and scrolls continuously when it does not.
export default function MarqueeText({text, className = ''}: MarqueeTextProps) {
    const containerRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [distance, setDistance] = useState(0);

    useLayoutEffect(() => {
        const container = containerRef.current;
        const content = textRef.current;
        if (!container || !content) return;
        const measure = () => {
            if (prefersReducedMotion()) {
                setDistance(0);
                return;
            }
            const textWidth = content.getBoundingClientRect().width;
            const available = container.clientWidth;
            setDistance(textWidth > available + 1 ? textWidth + GAP_PX : 0);
        };
        measure();
        // The text span is inline while it fits, which ResizeObserver cannot watch, so a web font that
        // finishes loading after the first measurement is caught through the font loading events instead.
        const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
        fonts?.addEventListener('loadingdone', measure);
        fonts?.ready.then(measure, () => {});
        let observer: ResizeObserver | undefined;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(measure);
            observer.observe(container);
            observer.observe(content);
        }
        return () => {
            fonts?.removeEventListener('loadingdone', measure);
            observer?.disconnect();
        };
    }, [text]);

    const scrolling = distance > 0;
    const style = scrolling ? {
        '--marquee-distance': `${distance}px`,
        '--marquee-duration': `${Math.max(MIN_DURATION_SECONDS, distance / SPEED_PX_PER_SECOND)}s`,
        '--marquee-gap': `${GAP_PX}px`,
    } as CSSProperties : undefined;

    return (
        <span ref={containerRef} className={`marquee block min-w-0 ${scrolling ? 'marquee--scrolling' : 'truncate'} ${className}`}>
            {/* Keyed by text so a new label restarts from its leading pause instead of mid-scroll. */}
            <span key={text} className={scrolling ? 'marquee-track' : undefined} style={style}>
                <span ref={textRef} className="marquee-copy">{text}</span>
                {scrolling && <span className="marquee-copy" aria-hidden="true">{text}</span>}
            </span>
        </span>
    );
}
