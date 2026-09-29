import type {ReactNode} from 'react';
import {Button} from './Button';

interface SelectionGroupProps<T extends string> {
    label: string;
    options: {value: T; label: ReactNode; selected: boolean; title?: string}[];
    onSelect: (value: T) => void;
}

export default function SelectionGroup<T extends string>({label, options, onSelect}: SelectionGroupProps<T>) {
    return <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map(option => <Button key={option.value} size="sm" variant={option.selected ? 'selected' : 'secondary'}
            aria-pressed={option.selected} title={option.title} onClick={() => onSelect(option.value)}>
            {option.label}
        </Button>)}
    </div>;
}
