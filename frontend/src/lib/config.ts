// Runtime configuration injected by Go server
interface RuntimeConfig {
    defaultTitle?: string;
    defaultDescription?: string;
    bannerMessage?: string;
    bannerVariant?: string;
    bannerLinkText?: string;
    bannerLinkUrl?: string;
    capPublicEndpoint?: string;
    buildId?: string;
}

declare global {
    interface Window {
        __CONFIG__?: RuntimeConfig;
    }
}

const config = typeof window === 'undefined' ? {} : window.__CONFIG__ || {};

export const DEFAULT_TITLE = config.defaultTitle || 'Audio Archive';
export const DEFAULT_DESCRIPTION = config.defaultDescription || 'Browse and listen to audio files';
export const CAP_PUBLIC_ENDPOINT = config.capPublicEndpoint?.trim()
    || import.meta.env.VITE_CAP_PUBLIC_ENDPOINT?.trim()
    || '';
export const BUILD_ID = config.buildId?.trim() || '';

export type BannerVariant = 'info' | 'warning' | 'success';

const bannerMessage = config.bannerMessage?.trim() || '';
const bannerVariant = config.bannerVariant === 'warning' || config.bannerVariant === 'success'
    ? config.bannerVariant
    : 'info';
const bannerLinkText = config.bannerLinkText?.trim() || '';
const bannerLinkUrl = config.bannerLinkUrl?.trim() || '';

export const INFO_BANNER = {
    enabled: bannerMessage.length > 0,
    message: bannerMessage,
    variant: bannerVariant as BannerVariant,
    linkText: bannerLinkText,
    linkUrl: bannerLinkUrl,
};
