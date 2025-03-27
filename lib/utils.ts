
export const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

export const sizeFromString = (size: string) => {
    const match = size.toLowerCase().match(/^(\d+(\.\d+)?)([a-z]+)?$/);
    if (!match) return NaN;
    const num = parseFloat(match[1]);
    const unit = match[3] || '';
    switch (unit) {
        case 'b': return num;
        case 'k':
        case 'kb': return num * 1024;
        case 'm':
        case 'mb': return num * 1024 * 1024;
        case 'g':
        case 'gb': return num * 1024 * 1024 * 1024;
        case 't':
        case 'tb': return num * 1024 * 1024 * 1024 * 1024;
        default: return NaN;
    }
}

export function reverseIf<T>(array: T[], condition: boolean): T[] {
    return condition ? [...array].reverse() : array;
}