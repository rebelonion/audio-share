import React, { useId, useMemo } from 'react';

interface WaveformDisplayProps {
    peaks: Uint8Array;
    progress: number; // 0..1
    onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
    progressRef: React.RefObject<HTMLDivElement | null>;
    height?: number;
    className?: string;
}

export default function WaveformDisplay({
    peaks,
    progress,
    onClick,
    progressRef,
    height = 40,
    className = '',
}: WaveformDisplayProps) {
    const id = useId();
    const W = peaks.length;
    const H = 100;
    const half = H / 2;

    const pathD = useMemo(() => {
        const minAmp = 1.5; // minimum half-height in viewBox units, keeps silent sections visible
        const parts: string[] = [`M 0 ${half}`];
        for (let i = 0; i < peaks.length; i++) {
            const amp = Math.max(minAmp, (peaks[i] / 255) * half);
            parts.push(`L ${i} ${half - amp}`);
        }
        for (let i = peaks.length - 1; i >= 0; i--) {
            const amp = Math.max(minAmp, (peaks[i] / 255) * half);
            parts.push(`L ${i} ${half + amp}`);
        }
        parts.push('Z');
        return parts.join(' ');
    }, [peaks]);

    const progressX = progress * W;

    return (
        <div
            ref={progressRef}
            className={`w-full cursor-pointer ${className}`}
            style={{ height: `${height}px` }}
            onClick={onClick}
        >
            <svg
                width='100%'
                height={height}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio='none'
                aria-label='Audio waveform'
            >
                <defs>
                    <clipPath id={`${id}-u`}>
                        <rect x={progressX} y={0} width={W - progressX} height={H} />
                    </clipPath>
                    <clipPath id={`${id}-p`}>
                        <rect x={0} y={0} width={progressX} height={H} />
                    </clipPath>
                </defs>
                <path d={pathD} fill='var(--muted)' clipPath={`url(#${id}-u)`} />
                <path d={pathD} fill='var(--primary)' clipPath={`url(#${id}-p)`} />
            </svg>
        </div>
    );
}
