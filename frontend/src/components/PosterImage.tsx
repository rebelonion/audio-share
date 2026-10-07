import {useState} from 'react';
import {API_BASE} from '@/lib/api';
import {useSeasons} from '@/hooks/useSeasons';

interface PosterImageProps {
    shareKey: string;
    className?: string;
}

export default function PosterImage({ shareKey, className }: PosterImageProps) {
    const [imageError, setImageError] = useState(false);
    const winter = useSeasons().includes('midwinter');

    if (imageError) {
        return null;
    }

    const image = (
        <img
            src={`${API_BASE}/api/folder/key/${shareKey}/poster?size=card`}
            alt=""
            width={32}
            height={32}
            loading="lazy"
            className={winter ? 'h-full w-full object-cover' : className}
            onError={() => setImageError(true)}
        />
    );
    if (!winter) return image;

    // A cap of snow and a few drifting flakes; styles live in index.css.
    return (
        <span className={`poster-snow relative overflow-hidden ${className ?? ''}`} data-testid="poster-snow">
            {image}
            <span className="poster-snow__flake" />
            <span className="poster-snow__flake" />
            <span className="poster-snow__flake" />
        </span>
    );
}
