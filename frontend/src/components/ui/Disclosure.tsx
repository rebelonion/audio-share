import type {ReactNode} from 'react';

export default function Disclosure({id, open, className = '', children}: {id: string; open: boolean; className?: string; children: ReactNode}) {
    return <div id={id} inert={!open} aria-hidden={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'} ${className}`}>
        <div className="overflow-hidden">{children}</div>
    </div>;
}
