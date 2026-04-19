// Runtime configuration injected by Go server
interface RuntimeConfig {
    defaultTitle?: string;
    defaultDescription?: string;
    rybbitUrl?: string;
    rybbitSiteId?: string;
}

declare global {
    interface Window {
        __CONFIG__?: RuntimeConfig;
    }
}

const config = window.__CONFIG__ || {};

export const DEFAULT_TITLE = config.defaultTitle || 'Audio Archive';
export const DEFAULT_DESCRIPTION = config.defaultDescription || 'Browse and listen to audio files';
export const RYBBIT_URL = config.rybbitUrl || '';
export const RYBBIT_SITE_ID = config.rybbitSiteId || '';
