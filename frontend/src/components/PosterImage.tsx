import {useState} from 'react';
import {API_BASE} from '@/lib/api';

interface PosterImageProps {
    path: string;
    posterImage: string;
    className?: string;
}

export default function PosterImage({ path, posterImage, className }: PosterImageProps) {
    const [imageError, setImageError] = useState(false);

    if (imageError) {
        return null;
    }

    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const posterUrl = `${API_BASE}/api/audio/${encodedPath}/${posterImage}`;

    return (
        <img
            src={posterUrl}
            alt="" // Decorative image
            width={32}
            height={32}
            loading="lazy"
            className={className}
            onError={() => setImageError(true)}
        />
    );
}
