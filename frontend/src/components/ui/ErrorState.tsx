import type {ReactNode} from 'react';
import Alert from './Alert';
import {Button} from './Button';

export default function ErrorState({title, children, onRetry, retryLabel = 'Try again', className = ''}: {title: string; children?: ReactNode; onRetry: () => void; retryLabel?: string; className?: string}) {
    return <Alert className={`text-center ${className}`}>
        <h2 className="text-xl font-semibold">{title}</h2>
        {children && <p className="mt-2">{children}</p>}
        <Button onClick={onRetry} className="mt-5">{retryLabel}</Button>
    </Alert>;
}
