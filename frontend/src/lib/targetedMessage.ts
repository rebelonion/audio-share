import {API_BASE} from '@/lib/api';
import {appFetch} from '@/lib/cloudflareChallenge';

export interface TargetedMessage {
    id: number;
    title: string;
    message: string;
}

let pendingRequest: Promise<TargetedMessage | null> | null = null;

export function fetchTargetedMessage(): Promise<TargetedMessage | null> {
    if (pendingRequest) return pendingRequest;

    const request = appFetch(`${API_BASE}/api/session/targeted-message`, {
        method: 'POST',
        credentials: 'include',
    }).then(async response => {
        if (response.status === 204) return null;
        if (!response.ok) {
            throw new Error(`Failed to fetch targeted message: ${response.status}`);
        }

        const message = await response.json() as Partial<TargetedMessage>;
        if (
            typeof message.id !== 'number'
            || typeof message.title !== 'string'
            || typeof message.message !== 'string'
        ) {
            throw new Error('Invalid targeted message response');
        }
        return message as TargetedMessage;
    });

    pendingRequest = request;
    const clearRequest = () => {
        if (pendingRequest === request) pendingRequest = null;
    };
    void request.then(clearRequest, clearRequest);

    return request;
}
