export const contactTopicOptions = [
    { value: 'general', label: 'General Question' },
    { value: 'bug', label: 'Bug Report' },
    { value: 'feature', label: 'Feature Request' },
    { value: 'content', label: 'Content Issue' },
    { value: 'abuse', label: 'Abuse' },
    { value: 'other', label: 'Other' },
];

export function contactTopicFromSearch(search: string) {
    const requestedTopic = new URLSearchParams(search).get('topic');
    return contactTopicOptions.some(({ value }) => value === requestedTopic) ? requestedTopic! : '';
}

export interface ContactDiagnostics {
    browser: string;
    platform: string;
    viewport: string;
    screen: string;
    language: string;
    timezone: string;
    page: string;
    appBuildId: string;
}

export function browserFromUserAgent(userAgent: string): string {
    const browsers: Array<[RegExp, string]> = [
        [/\bEdg(?:A|iOS)?\/([\d.]+)/, 'Edge'],
        [/\bOPR\/([\d.]+)/, 'Opera'],
        [/\bCriOS\/([\d.]+)/, 'Chrome'],
        [/\bChrome\/([\d.]+)/, 'Chrome'],
        [/\bFxiOS\/([\d.]+)/, 'Firefox'],
        [/\bFirefox\/([\d.]+)/, 'Firefox'],
    ];

    for (const [pattern, name] of browsers) {
        const match = userAgent.match(pattern);
        if (match) return `${name} ${match[1]}`;
    }

    const safariVersion = userAgent.match(/\bVersion\/([\d.]+).*\bSafari\//);
    return safariVersion ? `Safari ${safariVersion[1]}` : 'Unknown';
}

export function collectContactDiagnostics(appBuildId: string): ContactDiagnostics {
    return {
        browser: browserFromUserAgent(navigator.userAgent),
        platform: navigator.platform || 'Unknown',
        viewport: `${window.innerWidth}x${window.innerHeight} @ ${window.devicePixelRatio || 1}x`,
        screen: `${window.screen.width}x${window.screen.height}`,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
        page: `${window.location.pathname}${window.location.search}`,
        appBuildId,
    };
}
