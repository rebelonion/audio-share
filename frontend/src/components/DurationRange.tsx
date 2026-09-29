import {useEffect, useRef, useState} from 'react';
import {Slider, SliderTrack} from '@/components/ui/Slider';

const MAX_MINUTES = 240;
const INF_POS = MAX_MINUTES + 1;

function posToSeconds(pos: number): number {
    if (pos <= 0 || pos >= INF_POS) return 0;
    return pos * 60;
}

function secondsToPos(s: number): number {
    if (s <= 0) return 0;
    return Math.min(Math.round(s / 60), MAX_MINUTES);
}

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
}

interface DurationRangeProps {
    minVal: number; // seconds; 0 = no min
    maxVal: number; // seconds; 0 = no max
    onChange: (min: number, max: number) => void;
}

export default function DurationRange({ minVal, maxVal, onChange }: DurationRangeProps) {
    const [localMinPos, setLocalMinPos] = useState(() => secondsToPos(minVal));
    const [localMaxPos, setLocalMaxPos] = useState(() => maxVal === 0 ? INF_POS : secondsToPos(maxVal));

    useEffect(() => {
        setLocalMinPos(secondsToPos(minVal));
        setLocalMaxPos(maxVal === 0 ? INF_POS : secondsToPos(maxVal));
    }, [minVal, maxVal]);

    const dragging = useRef(false);
    const commit = (minPos: number, maxPos: number) => {
        const min = posToSeconds(minPos);
        const max = posToSeconds(maxPos);
        if (min !== minVal || max !== maxVal) onChange(min, max);
    };
    const finishDrag = () => {
        dragging.current = false;
        commit(localMinPos, localMaxPos);
    };

    const displayMin = posToSeconds(localMinPos);
    const displayMax = posToSeconds(localMaxPos);
    const fillStart = (localMinPos / INF_POS) * 100;
    const fillEnd = (localMaxPos / INF_POS) * 100;

    return (
        <div className="px-1">
            <div className="flex justify-between text-sm text-[var(--muted-foreground)] mb-3">
                <span className={displayMin > 0 ? 'text-[var(--foreground)] font-medium' : ''}>
                    {displayMin > 0 ? `≥ ${formatDuration(displayMin)}` : 'Any'}
                </span>
                <span className={localMaxPos < INF_POS ? 'text-[var(--foreground)] font-medium' : ''}>
                    {localMaxPos < INF_POS ? `≤ ${formatDuration(displayMax)}` : '∞'}
                </span>
            </div>
            <SliderTrack start={fillStart} end={fillEnd}>
                <Slider overlay
                    onPointerDown={() => { dragging.current = true; }}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                    onBlur={finishDrag}
                    min={0}
                    max={INF_POS}
                    aria-label="Minimum duration"
                    aria-valuetext={localMinPos === 0 ? 'No minimum' : `${localMinPos} ${localMinPos === 1 ? 'minute' : 'minutes'}`}
                    value={localMinPos}
                    onChange={(e) => {
                        const pos = parseInt(e.target.value);
                        if (pos < localMaxPos) {
                            setLocalMinPos(pos);
                            if (!dragging.current) commit(pos, localMaxPos);
                        }
                    }}
                    style={{ zIndex: localMinPos >= INF_POS - 1 ? 4 : 2 }}
                />
                <Slider overlay
                    onPointerDown={() => { dragging.current = true; }}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                    onBlur={finishDrag}
                    min={0}
                    max={INF_POS}
                    aria-label="Maximum duration"
                    aria-valuetext={localMaxPos === INF_POS ? 'No maximum' : `${localMaxPos} ${localMaxPos === 1 ? 'minute' : 'minutes'}`}
                    value={localMaxPos}
                    onChange={(e) => {
                        const pos = parseInt(e.target.value);
                        if (pos > localMinPos) {
                            setLocalMaxPos(pos);
                            if (!dragging.current) commit(localMinPos, pos);
                        }
                    }}
                    style={{ zIndex: 3 }}
                />
            </SliderTrack>
        </div>
    );
}
