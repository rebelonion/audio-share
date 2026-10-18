// Runtime configuration injected by Go server
interface RuntimeConfig {
    defaultTitle?: string;
    defaultDescription?: string;
    capPublicEndpoint?: string;
    buildId?: string;
    errorReporting?: boolean;
}

declare global {
    interface Window {
        __CONFIG__?: RuntimeConfig;
        // Site banner set from the admin dashboard, injected per page load.
        // Untrusted until checked below, so every field is an optional string.
        __BANNER__?: Partial<Record<keyof SiteBanner, string>>;
    }
}

const config = typeof window === 'undefined' ? {} : window.__CONFIG__ || {};

export const DEFAULT_TITLE = config.defaultTitle || 'Audio Archive';
export const DEFAULT_DESCRIPTION = config.defaultDescription || 'Browse and listen to audio files';
export const CAP_PUBLIC_ENDPOINT = config.capPublicEndpoint?.trim()
    || import.meta.env.VITE_CAP_PUBLIC_ENDPOINT?.trim()
    || '';
export const BUILD_ID = config.buildId?.trim() || '';
export const ERROR_REPORTING = config.errorReporting === true || import.meta.env.VITE_ERROR_REPORTING === 'true';

export type BannerVariant = 'info' | 'warning' | 'success';
// The site banner as the server stores and returns it; empty link fields are omitted.
export interface SiteBanner {message: string; variant: BannerVariant; linkText?: string; linkUrl?: string}

const banner = typeof window === 'undefined' ? undefined : window.__BANNER__;
const bannerMessage = banner?.message?.trim() || '';

export const INFO_BANNER: SiteBanner | null = bannerMessage ? {
    message: bannerMessage,
    variant: banner?.variant === 'warning' || banner?.variant === 'success' ? banner.variant : 'info',
    linkText: banner?.linkText?.trim() || '',
    linkUrl: banner?.linkUrl?.trim() || '',
} : null;
