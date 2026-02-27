import {useState} from 'react';
import {API_BASE} from '@/lib/api';

interface PosterImageProps {
    shareKey: string;
    className?: string;
}

export default function PosterImage({ shareKey, className }: PosterImageProps) {
    const [imageError, setImageError] = useState(false);

    if (imageError) {
        return null;
    }

    return (
        <img
            src={`${API_BASE}/api/folder/key/${shareKey}/poster`}
            alt=""
            width={32}
            height={32}
            loading="lazy"
            className={className}
            onError={() => setImageError(true)}
        />
    );
}
