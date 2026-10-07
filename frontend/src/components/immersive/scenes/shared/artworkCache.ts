/**
 * Offscreen artwork keyed by what it depicts. Everything drawn recently stays
 * cached, however many trees a wide frame needs; entries idle for longer than
 * the retention window are swept out as the scene scrolls on.
 */
export class ArtworkCache<T = HTMLCanvasElement> {
    private entries = new Map<string, {artwork: T; lastUsed: number}>();
    private lastSweep = 0;

    constructor(private retention = 2000) {}

    get(key: string, now = performance.now()): T | undefined {
        const entry = this.entries.get(key);
        if (entry) entry.lastUsed = now;
        return entry?.artwork;
    }

    set(key: string, artwork: T, now = performance.now()): T {
        this.entries.set(key, {artwork, lastUsed: now});
        if (now - this.lastSweep > this.retention) {
            this.lastSweep = now;
            for (const [cached, entry] of this.entries) {
                if (now - entry.lastUsed > this.retention) this.entries.delete(cached);
            }
        }
        return artwork;
    }

    get size(): number {
        return this.entries.size;
    }
}
