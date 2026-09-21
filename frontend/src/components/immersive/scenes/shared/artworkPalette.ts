import {useEffect, useState} from 'react';

export function dominantArtworkHue(pixels: Uint8ClampedArray): number | null {
    const bins = Array.from({length: 12}, () => ({weight: 0, hue: 0}));
    for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b] = [pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255];
        const high = Math.max(r, g, b);
        const low = Math.min(r, g, b);
        const delta = high - low;
        if (pixels[i + 3] < 128 || delta < 0.12 || high < 0.15 || low > 0.85) continue;
        const rawHue = high === r ? ((g - b) / delta) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        const hue = (rawHue * 60 + 360) % 360;
        const bin = bins[Math.floor(hue / 30)];
        bin.weight += delta;
        bin.hue += hue * delta;
    }
    const dominant = bins.reduce((best, bin) => bin.weight > best.weight ? bin : best);
    if (!dominant.weight) return null;
    return dominant.hue / dominant.weight;
}

export function useArtworkPalette<T>(thumbnail: string | null, fallback: T, fromPixels: (pixels: Uint8ClampedArray) => T): T {
    const [palette, setPalette] = useState(fallback);
    useEffect(() => {
        setPalette(fallback);
        if (!thumbnail) return;
        let cancelled = false;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            if (cancelled) return;
            const canvas = document.createElement('canvas');
            canvas.width = 24;
            canvas.height = 24;
            const ctx = canvas.getContext('2d', {willReadFrequently: true});
            if (!ctx) return;
            try {
                ctx.drawImage(image, 0, 0, 24, 24);
                setPalette(fromPixels(ctx.getImageData(0, 0, 24, 24).data));
            } catch {
                // Artwork without canvas access keeps the scene’s default palette.
            }
        };
        image.src = thumbnail;
        return () => { cancelled = true; image.onload = null; };
    }, [thumbnail, fallback, fromPixels]);

    return palette;
}
