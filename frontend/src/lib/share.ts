export function audioShareUrl(shareKey: string, origin = window.location.origin): string {
    return `${origin}/share/${encodeURIComponent(shareKey)}`;
}
