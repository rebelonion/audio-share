import type {SceneLayer} from '../types';

// Keep the currently visible mixture when another track or resource arrives mid-transition.
export class SceneTransition<T> {
    private layers: SceneLayer<T>[] = [];
    private from: SceneLayer<T>[] = [];
    private target?: T;
    private duration = 0;
    private key = '';
    private elapsed = 0;
    private origin = 0;

    constructor(private span: (duration: number) => number) {}

    update(data: T, key: string, time: number, duration: number, travel: number, elapsed: number, animate: boolean): SceneLayer<T>[] {
        if (data !== this.target || duration !== this.duration || key !== this.key) {
            this.from = this.layers;
            this.target = data;
            this.duration = duration;
            this.key = key;
            this.origin = travel;
            this.elapsed = 0;
        } else {
            this.elapsed += elapsed;
        }
        const progress = animate && this.from.length ? Math.min(1, this.elapsed / 2.4) : 1;
        const blend = progress * progress * (3 - 2 * progress);
        this.layers = this.from.map(layer => ({
            ...layer,
            time: layer.time + (travel - this.origin) * this.span(layer.duration),
            weight: layer.weight * (1 - blend),
        })).filter(layer => layer.weight > 0.0001);
        this.layers.push({data, time, duration, weight: blend});
        if (progress === 1) this.from = [];
        return this.layers;
    }
}

const rgbCache = new Map<string, number[]>();

function rgb(color: string): number[] {
    const cached = rgbCache.get(color);
    if (cached) return cached;
    let value: number[];
    if (color.startsWith('#')) {
        value = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
    } else {
        const [hue, saturation, lightness] = color.match(/[\d.]+/g)!.map(Number);
        const light = lightness / 100;
        const amplitude = saturation / 100 * Math.min(light, 1 - light);
        value = [0, 8, 4].map(offset => {
            const phase = (offset + hue / 30) % 12;
            return 255 * (light - amplitude * Math.max(-1, Math.min(phase - 3, 9 - phase, 1)));
        });
    }
    rgbCache.set(color, value);
    return value;
}

export function mixPalette<K extends string>(layers: {palette: Record<K, string>; weight: number}[]): Record<K, string> {
    if (layers.length === 1) return layers[0].palette;
    const result = {...layers[0].palette};
    for (const key in result) {
        const channels = [0, 0, 0];
        for (const layer of layers) {
            rgb(layer.palette[key]).forEach((value, channel) => { channels[channel] += value * layer.weight; });
        }
        result[key] = `rgb(${channels.map(Math.round).join(', ')})`;
    }
    return result;
}
