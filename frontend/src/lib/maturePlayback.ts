interface MatureTrack {
    ageLimit?: number;
}

interface MatureMetadata extends MatureTrack {
    isMature?: boolean;
    showMature?: boolean;
}

export function shouldWaitForMaturePlaybackMetadata(
    track: MatureTrack | null,
    metadata: MatureMetadata | null,
    acknowledged: boolean,
): boolean {
    return !acknowledged
        && metadata === null
        && typeof track?.ageLimit === 'number'
        && track.ageLimit >= 18;
}

export function needsMaturePlaybackConfirmation(
    track: MatureTrack | null,
    metadata: MatureMetadata | null,
    acknowledged: boolean,
): boolean {
    const isMature = metadata?.isMature
        || (typeof metadata?.ageLimit === 'number' && metadata.ageLimit >= 18)
        || (typeof track?.ageLimit === 'number' && track.ageLimit >= 18);
    return !!isMature && !metadata?.showMature && !acknowledged;
}
