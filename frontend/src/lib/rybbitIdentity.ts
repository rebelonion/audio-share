import type {AdBlockStatus, AdDeliveryStatus} from './adBlockProbe';

let adBlockStatus: AdBlockStatus | undefined;
let adDeliveryStatus: AdDeliveryStatus | undefined;

function adBlockTraits() {
    return adBlockStatus && adDeliveryStatus
        ? {
            ad_block_status: adBlockStatus,
            ad_delivery_status: adDeliveryStatus,
        }
        : undefined;
}

export function syncRybbitIdentity(profileId: string | undefined) {
    if (!profileId || !window.rybbit) return;

    const traits = adBlockTraits();
    if (window.rybbit.getUserId() === profileId) {
        if (traits) window.rybbit.setTraits(traits);
        return;
    }

    if (traits) {
        window.rybbit.identify(profileId, traits);
    } else {
        window.rybbit.identify(profileId);
    }
}

export function setRybbitAdBlockTraits(
    status: AdBlockStatus,
    deliveryStatus: AdDeliveryStatus,
) {
    adBlockStatus = status;
    adDeliveryStatus = deliveryStatus;

    const traits = adBlockTraits()!;
    window.rybbit?.onReady(rybbit => {
        if (rybbit.getUserId()) rybbit.setTraits(traits);
    });
}
