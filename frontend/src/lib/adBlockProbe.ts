export type AdBlockStatus = 'blocked' | 'not_detected' | 'unknown';
export type AdDeliveryStatus = 'available' | 'blocked' | 'unknown';
export type NetworkAdProbeStatus = 'loaded' | 'blocked' | 'extension_redirect';

export interface AdBlockProbeResult {
    status: AdBlockStatus;
    adDeliveryStatus: AdDeliveryStatus;
    controlScriptLoaded: boolean;
    easyListBaitScriptLoaded: boolean;
    networkAdRequestStatus: NetworkAdProbeStatus;
    cosmeticBaitHidden: boolean | null;
}

const SCRIPT_TIMEOUT_MS = 3000;
const NETWORK_AD_URL = 'https://pagead2.googlesyndication.com/pagead/gen_204';

function loadProbeScript(src: string): Promise<boolean> {
    return new Promise(resolve => {
        const script = document.createElement('script');
        let settled = false;

        const finish = (loaded: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            script.remove();
            resolve(loaded);
        };

        const timeout = window.setTimeout(() => finish(false), SCRIPT_TIMEOUT_MS);
        script.async = true;
        script.src = src;
        script.addEventListener('load', () => finish(true), {once: true});
        script.addEventListener('error', () => finish(false), {once: true});
        document.head.appendChild(script);
    });
}

export async function loadNetworkAdProbe(): Promise<NetworkAdProbeStatus> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SCRIPT_TIMEOUT_MS);

    try {
        const response = await fetch(NETWORK_AD_URL, {
            mode: 'no-cors',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            signal: controller.signal,
        });
        if (
            response.redirected
            && (
                response.url.startsWith('chrome-extension://')
                || response.url.startsWith('moz-extension://')
            )
        ) {
            return 'extension_redirect';
        }

        return response.redirected ? 'blocked' : 'loaded';
    } catch {
        return 'blocked';
    } finally {
        window.clearTimeout(timeout);
    }
}

export async function detectCosmeticFiltering(): Promise<boolean | null> {
    if (!document.body) return null;

    const baits = [
        {id: 'AdBanner', className: 'ad--banner'},
        {id: 'AD_300', className: 'ad--container'},
    ].map(({id, className}) => {
        const bait = document.createElement('div');
        bait.id = id;
        bait.className = className;
        bait.setAttribute('aria-hidden', 'true');
        Object.assign(bait.style, {
            position: 'absolute',
            left: '-10000px',
            top: '-10000px',
            width: '1px',
            height: '1px',
            pointerEvents: 'none',
        });
        document.body.appendChild(bait);
        return bait;
    });

    await new Promise<void>(resolve => window.setTimeout(resolve, 250));

    const hidden = baits.some(bait => {
        if (!bait.isConnected) return true;

        const style = window.getComputedStyle(bait);
        const bounds = bait.getBoundingClientRect();
        return style.display === 'none'
            || style.visibility === 'hidden'
            || bounds.width === 0
            || bounds.height === 0;
    });

    baits.forEach(bait => bait.remove());
    return hidden;
}

export function classifyAdBlockProbe(
    controlScriptLoaded: boolean,
    easyListBaitScriptLoaded: boolean,
    networkAdRequestStatus: NetworkAdProbeStatus,
    cosmeticBaitHidden: boolean | null,
): AdBlockStatus {
    if (
        cosmeticBaitHidden === true
        || (controlScriptLoaded && !easyListBaitScriptLoaded)
        || networkAdRequestStatus === 'extension_redirect'
    ) {
        return 'blocked';
    }

    if (
        !controlScriptLoaded
        || cosmeticBaitHidden === null
    ) {
        return 'unknown';
    }

    return 'not_detected';
}

export function classifyAdDeliveryProbe(
    controlScriptLoaded: boolean,
    easyListBaitScriptLoaded: boolean,
    networkAdRequestStatus: NetworkAdProbeStatus,
    cosmeticBaitHidden: boolean | null,
): AdDeliveryStatus {
    if (
        cosmeticBaitHidden === true
        || (controlScriptLoaded && !easyListBaitScriptLoaded)
        || networkAdRequestStatus === 'extension_redirect'
    ) {
        return 'blocked';
    }

    if (!controlScriptLoaded || cosmeticBaitHidden === null) {
        return 'unknown';
    }

    return networkAdRequestStatus === 'blocked' ? 'blocked' : 'available';
}

export async function detectAdBlocking(): Promise<AdBlockProbeResult> {
    const [
        controlScriptLoaded,
        easyListBaitScriptLoaded,
        networkAdRequestStatus,
        cosmeticBaitHidden,
    ] = await Promise.all([
        loadProbeScript('/diagnostics/control.js?probe=1'),
        loadProbeScript('/common/ad.js?probe=1'),
        loadNetworkAdProbe(),
        detectCosmeticFiltering(),
    ]);

    return {
        status: classifyAdBlockProbe(
            controlScriptLoaded,
            easyListBaitScriptLoaded,
            networkAdRequestStatus,
            cosmeticBaitHidden,
        ),
        adDeliveryStatus: classifyAdDeliveryProbe(
            controlScriptLoaded,
            easyListBaitScriptLoaded,
            networkAdRequestStatus,
            cosmeticBaitHidden,
        ),
        controlScriptLoaded,
        easyListBaitScriptLoaded,
        networkAdRequestStatus,
        cosmeticBaitHidden,
    };
}
