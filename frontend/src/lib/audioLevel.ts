// Keep the graph alive with the player: disconnecting it would silence its media element.
export function createAudioLevelReader(onInterrupted: () => void = () => {}) {
    let context: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let attached: HTMLAudioElement | null = null;
    let samples: Float32Array<ArrayBuffer> | null = null;
    let disposed = false;
    const isRunning = () => context?.state === 'running';

    return {
        isInterrupted() {
            return !!attached && context?.state !== 'running';
        },
        async resume() {
            if (disposed || !attached || !context || isRunning()) return;
            // Some browsers leave resume pending until another user gesture.
            let timeout: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([
                    context.resume(),
                    new Promise<void>((_, reject) => {
                        timeout = setTimeout(() => reject(new DOMException('Audio resume blocked', 'NotAllowedError')), 1500);
                    }),
                ]);
                if (!disposed && !isRunning()) {
                    throw new DOMException('Audio remains interrupted', 'NotAllowedError');
                }
            } catch {
                if (!disposed) throw new DOMException('Audio resume blocked', 'NotAllowedError');
            } finally {
                clearTimeout(timeout);
            }
        },
        async enable(getAudio: () => HTMLAudioElement | null) {
            if (disposed || typeof AudioContext === 'undefined') return;
            try {
                context ??= new AudioContext();
                context.onstatechange = () => {
                    if (!disposed && attached && context?.state !== 'running') onInterrupted();
                };
                if (context.state !== 'running') await context.resume();
                const audio = getAudio();
                if (disposed || !audio || attached || context.state !== 'running') return;
                // Unconfigured cross-origin media can become silent when routed through Web Audio.
                if (new URL(audio.src, location.href).origin !== location.origin && !audio.crossOrigin) return;
                const nextAnalyser = context.createAnalyser();
                nextAnalyser.fftSize = 2048;
                nextAnalyser.connect(context.destination);
                // TODO: Verify iOS Safari playback when locking the screen or switching apps after
                // opening immersive mode, including after closing it. This graph stays attached
                // across track changes; disconnecting it would silence the element, not restore
                // native playback. Background interruption is an unverified risk for this graph:
                // https://bugs.webkit.org/show_bug.cgi?id=276016
                const nextSource = context.createMediaElementSource(audio);
                nextSource.connect(nextAnalyser);
                source = nextSource;
                analyser = nextAnalyser;
                attached = audio;
                samples = new Float32Array(nextAnalyser.fftSize);
            } catch {
                // Analysis is optional; unsupported setup leaves ordinary playback available.
            }
        },
        read() {
            if (!analyser || !samples || !attached || context?.state !== 'running'
                || attached.paused || attached.ended || attached.muted || attached.readyState < 3) return 0;
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) sum += sample * sample;
            const rms = Math.sqrt(sum / samples.length);
            // Fixed, bounded sensitivity makes quiet material visible without amplifying silence.
            const db = 20 * Math.log10(Math.max(rms, 1e-8));
            return Math.max(0, Math.min(1, (db + 55) / 40));
        },
        dispose() {
            disposed = true;
            if (context) context.onstatechange = null;
            source?.disconnect();
            analyser?.disconnect();
            if (context) void context.close().catch(() => {});
        },
    };
}

export function smoothAudioLevel(previous: number, target: number, elapsed: number) {
    const seconds = target > previous ? 0.15 : 0.75;
    return previous + (target - previous) * (1 - Math.exp(-Math.max(0, elapsed) / seconds));
}
