import type {ComponentProps} from 'react';
import {controlClass, searchControlClass, sizes} from './fieldStyles';
type FieldSize = keyof typeof sizes;

export function Input({fieldSize = 'md', variant = 'default', className = '', ...props}: ComponentProps<'input'> & {fieldSize?: FieldSize; variant?: 'default' | 'search'}) {
    return <input {...props} className={`${variant === 'search' ? searchControlClass : controlClass} ${sizes[fieldSize]} ${className}`} />;
}

export function Textarea({fieldSize = 'md', className = '', ...props}: ComponentProps<'textarea'> & {fieldSize?: FieldSize}) {
    return <textarea {...props} className={`${controlClass} ${sizes[fieldSize]} ${className}`} />;
}
