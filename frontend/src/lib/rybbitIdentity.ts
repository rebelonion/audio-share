export function syncRybbitIdentity(profileId: string | undefined) {
    if (!profileId || !window.rybbit || window.rybbit.getUserId() === profileId) return;
    window.rybbit.identify(profileId);
}
