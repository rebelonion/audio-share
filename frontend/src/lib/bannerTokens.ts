// Dynamic placeholders in the site banner message, rendered in each visitor's
// own time zone. The server validates the same grammar (services/banner.go):
//
//   {datetime:2026-10-20T18:00Z}   Oct 20, 6:00 PM CDT
//   {date:2026-10-20T18:00Z}       Tue, Oct 20
//   {time:2026-10-20T18:00Z}       6:00 PM CDT
//   {relative:2026-10-20T18:00Z}   in 3 hours / 2 days ago
//   {countdown:2026-10-20T18:00Z}  2d 3h 04m 05s, or the text after | once it ends
//
// Anything else in braces is shown as written.

export type BannerTokenKind = 'datetime' | 'date' | 'time' | 'relative' | 'countdown';

export type BannerPart =
    | {type: 'text'; text: string}
    | {type: BannerTokenKind; at: number; iso: string; source: string; endText?: string};

const tokenPattern = /\{(datetime|date|time|relative|countdown):([^{}]*)\}/g;
// RFC 3339 with an explicit offset, seconds optional. The offset is required so
// the admin's time zone never leaks into how visitors read the moment.
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i;

export function parseBannerTimestamp(value: string): number | null {
    const trimmed = value.trim();
    if (!timestampPattern.test(trimmed)) return null;
    const at = Date.parse(trimmed.toUpperCase());
    return Number.isNaN(at) ? null : at;
}

export function parseBannerMessage(message: string): BannerPart[] {
    const parts: BannerPart[] = [];
    let last = 0;
    for (const match of message.matchAll(tokenPattern)) {
        const [source, kind, body] = match;
        const split = body.indexOf('|');
        const iso = (split < 0 ? body : body.slice(0, split)).trim();
        const at = parseBannerTimestamp(iso);
        // Invalid tokens stay literal so a typo is visible rather than silently dropped.
        if (at === null || (split >= 0 && kind !== 'countdown')) continue;
        if (match.index > last) parts.push({type: 'text', text: message.slice(last, match.index)});
        const endText = split < 0 ? undefined : body.slice(split + 1).trim();
        parts.push({type: kind as BannerTokenKind, at, iso, source, endText});
        last = match.index + source.length;
    }
    if (last < message.length) parts.push({type: 'text', text: message.slice(last)});
    return parts;
}

export const hasLiveParts = (parts: BannerPart[]) => parts.some(part => part.type === 'relative' || part.type === 'countdown');

const formats = {
    datetime: {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'},
    date: {weekday: 'short', month: 'short', day: 'numeric'},
    time: {hour: 'numeric', minute: '2-digit', timeZoneName: 'short'},
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export function formatBannerPart(part: Exclude<BannerPart, {type: 'text'}>, now: number, locale?: string): string {
    switch (part.type) {
        case 'datetime':
        case 'date':
        case 'time': {
            const options: Intl.DateTimeFormatOptions = {...formats[part.type]};
            // Name the year only when it isn't the visitor's current one.
            if (part.type !== 'time' && new Date(part.at).getFullYear() !== new Date(now).getFullYear()) options.year = 'numeric';
            return new Intl.DateTimeFormat(locale, options).format(part.at);
        }
        case 'relative':
            return formatRelative(part.at - now, locale);
        case 'countdown':
            return part.at > now ? formatCountdown(part.at - now) : part.endText || '0s';
    }
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86_400_000], ['month', 30 * 86_400_000], ['week', 7 * 86_400_000],
    ['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000],
];

function formatRelative(delta: number, locale?: string) {
    const format = new Intl.RelativeTimeFormat(locale, {numeric: 'auto'});
    for (const [unit, size] of relativeUnits) {
        if (Math.abs(delta) >= size) return format.format(Math.trunc(delta / size), unit);
    }
    return format.format(0, 'minute');
}

function formatCountdown(delta: number) {
    const total = Math.ceil(delta / 1000);
    const days = Math.floor(total / 86_400);
    const hours = Math.floor(total / 3600) % 24;
    const minutes = Math.floor(total / 60) % 60;
    const seconds = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    if (days > 0) return `${days}d ${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
    if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
    if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
    return `${seconds}s`;
}

// Builds a token for the admin's insert helper. `local` is a datetime-local
// value, read in the admin's time zone and stored as UTC.
export function buildBannerToken(kind: BannerTokenKind, local: string, endText = ''): string | null {
    const at = new Date(local);
    if (!local || Number.isNaN(at.getTime())) return null;
    const iso = at.toISOString().replace(/:00\.000Z$/, 'Z').replace(/\.000Z$/, 'Z');
    const end = kind === 'countdown' && endText.trim() ? `|${endText.trim().replace(/[{}]/g, '')}` : '';
    return `{${kind}:${iso}${end}}`;
}
