import type {ComponentProps, CSSProperties, ReactNode} from 'react';
import './Slider.css';

type SliderProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'min' | 'max'> & {
    value: number;
    min?: number;
    max?: number;
    overlay?: boolean;
    'aria-label': string;
};

export function Slider({value, min = 0, max = 100, overlay = false, className = '', style, ...props}: SliderProps) {
    const progress = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
    return <input {...props} type="range" min={min} max={max} value={value}
        data-overlay={overlay || undefined} className={`slider ${className}`}
        style={{'--slider-progress': `${progress}%`, ...style} as CSSProperties} />;
}

export function SliderTrack({start, end, children}: {start: number; end: number; children: ReactNode}) {
    return <div className="slider-range">
        <div className="slider-range-track" aria-hidden="true">
            <div className="slider-range-fill" style={{left: `${start}%`, right: `${100 - end}%`}} />
        </div>
        {children}
    </div>;
}
