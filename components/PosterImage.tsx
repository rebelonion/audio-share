'use client';

import React, {useState} from 'react';

interface PosterImageProps {
    path: string;
    className?: string;
}

export default function PosterImage({ path, className }: PosterImageProps) {
    const [imageError, setImageError] = useState(false);

    if (imageError) {
        return null;
    }

    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const posterUrl = `/api/audio/${encodedPath}/poster.jpg`;

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={posterUrl}
            alt=""
            width={32}
            height={32}
            loading="lazy"
            className={className}
            onError={() => setImageError(true)}
        />
    );
}
