import {useEffect, useRef} from 'react';
import {Slider} from '@/components/ui/Slider';
import {clamp} from '@/lib/utils';

interface PlaybackSeekProps {
    position: number;
    duration: number;
    disabled: boolean;
    onPreview: (time: number | null) => void;
    onSeek: (time: number) => void;
    className?: string;
}

export default function PlaybackSeek({position, duration, disabled, onPreview, onSeek, className}: PlaybackSeekProps) {
    const drag = useRef<{pointerId: number; target: number | null} | null>(null);

    useEffect(() => {
        if (disabled) {
            drag.current = null;
            onPreview(null);
        }
    }, [disabled, onPreview]);

    const finish = (input: HTMLInputElement, commit: boolean) => {
        const pending = drag.current;
        if (!pending) return;
        drag.current = null;
        if (commit && !disabled && pending.target !== null) onSeek(pending.target);
        onPreview(null);
        if (input.hasPointerCapture(pending.pointerId)) input.releasePointerCapture(pending.pointerId);
    };
    const timeLabel = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;

    return <Slider aria-label="Playback position" aria-valuetext={`${timeLabel(position)} of ${timeLabel(duration)}`}
        className={className} min={0} max={duration || 1} step={0.1} value={clamp(position, 0, duration || 1)} disabled={disabled}
        onPointerDown={event => {
            if (disabled || !event.isPrimary || event.button !== 0) return;
            drag.current = {pointerId: event.pointerId, target: null};
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onChange={event => {
            const time = Number(event.target.value);
            if (drag.current) {
                drag.current.target = time;
                onPreview(time);
            } else if (!disabled) onSeek(time);
        }}
        onPointerUp={event => {
            if (drag.current?.pointerId === event.pointerId) finish(event.currentTarget, true);
        }}
        onPointerCancel={event => {
            if (drag.current?.pointerId === event.pointerId) finish(event.currentTarget, false);
        }}
        onLostPointerCapture={event => {
            if (drag.current?.pointerId === event.pointerId) finish(event.currentTarget, false);
        }}
        onBlur={event => finish(event.currentTarget, false)} />;
}
