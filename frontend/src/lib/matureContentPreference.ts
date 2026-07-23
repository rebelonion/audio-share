export const MATURE_PREFERENCE_EVENT = 'audio-share:mature-preference';

const MATURE_WARNING_ACKNOWLEDGEMENTS = [
    'mature-warning-ack',
    'mature-download-warning-ack',
];

export function resetMatureContentClientState(): void {
    for (const key of MATURE_WARNING_ACKNOWLEDGEMENTS) {
        sessionStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent<boolean>(MATURE_PREFERENCE_EVENT, {detail: false}));
}
