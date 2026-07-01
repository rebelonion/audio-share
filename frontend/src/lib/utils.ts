
export const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
};

export const formatDuration = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '';
    }

    const totalSeconds = Math.round(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export const formatDate = (dateStr: string) => {
    let year: number, month: number, day: number;
    if (/^\d{8}$/.test(dateStr)) {
        year = parseInt(dateStr.slice(0, 4));
        month = parseInt(dateStr.slice(4, 6)) - 1;
        day = parseInt(dateStr.slice(6, 8));
    } else {
        const parts = dateStr.split('-');
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        day = parseInt(parts[2]);
    }
    const date = new Date(year, month, day);
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};


export function reverseIf<T>(array: T[], condition: boolean): T[] {
    return condition ? [...array].reverse() : array;
}
