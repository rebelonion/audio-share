import {useId, useState} from 'react';

export default function useDisclosure() {
    const id = useId();
    const [open, setOpen] = useState(false);
    return {
        open,
        setOpen,
        triggerProps: {
            'aria-expanded': open,
            'aria-controls': id,
            onClick: () => setOpen(value => !value),
        },
        panelProps: {id, open},
    };
}
