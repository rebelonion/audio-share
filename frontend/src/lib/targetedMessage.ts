import {API_BASE} from '@/lib/api';
import {appFetch} from '@/lib/cloudflareChallenge';
import {reportError} from '@/lib/errorReporting';

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
            const error = new Error('Invalid targeted message response');
            reportError({operation: 'targeted-message', stage: 'parse', cause: 'invalid-response'}, error);
            throw error;
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

export async function acknowledgeTargetedMessage(id: number): Promise<void> {
    const response = await appFetch(`${API_BASE}/api/session/targeted-message`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id}),
    });
    if (!response.ok) throw new Error(`Failed to acknowledge targeted message: ${response.status}`);
}
