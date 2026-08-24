export function audioShareUrl(shareKey: string, origin = window.location.origin): string {
    return `${origin}/share/${encodeURIComponent(shareKey)}`;
}

export function parseAudioShareTime(value: string | null): number | undefined {
    if (value === null) return undefined;

    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;

    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
        const seconds = Number(normalized);
        return Number.isFinite(seconds) ? seconds : undefined;
    }

    const unitTime = normalized.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/);
    if (unitTime && unitTime.slice(1).some(part => part !== undefined)) {
        const [, hours = '0', minutes = '0', seconds = '0'] = unitTime;
        const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
        return Number.isFinite(total) ? total : undefined;
    }

    const colonParts = normalized.split(':');
    if (
        (colonParts.length === 2 || colonParts.length === 3)
        && colonParts.every(part => /^\d+(?:\.\d+)?$/.test(part))
        && colonParts.slice(1).every(part => Number(part) < 60)
    ) {
        return colonParts.reduce((total, part) => total * 60 + Number(part), 0);
    }

    return undefined;
}
