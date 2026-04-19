interface Rybbit {
    pageview: () => void;
    event: (name: string, properties?: Record<string, unknown>) => void;
    identify: (userId: string, traits?: Record<string, unknown>) => void;
    setTraits: (traits: Record<string, unknown>) => void;
    clearUserId: () => void;
    getUserId: () => string | null;
    trackOutbound: (url: string, text?: string, target?: string) => void;
}

declare global {
    interface Window {
        rybbit?: Rybbit;
    }
}

export {};
