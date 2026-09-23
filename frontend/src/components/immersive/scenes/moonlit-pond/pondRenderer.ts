import {createPondRenderer} from './drawPond';
import type {SceneFrame} from '../types';
import type {Pond} from './pond';
import type {PondRenderRequest, PondRenderResult} from './pondCanvas';

export function createPondSceneRenderer() {
    const fallback = createPondRenderer();
    let worker: Worker | null | undefined;
    let bitmap: ImageBitmap | undefined;
    let inFlight: PondRenderRequest | undefined;
    let queued: PondRenderRequest | undefined;
    let latest: PondRenderRequest | undefined;
    let context: CanvasRenderingContext2D | ImageBitmapRenderingContext | undefined;
    let displayed = false;
    let fallbackCanvas: OffscreenCanvas | undefined;
    let directCanvas: HTMLCanvasElement | undefined;

    const paint = () => {
        if (!context || !latest) return;
        if (displayed && directCanvas?.style.opacity === '1') return;
        const {data, frame, pixelWidth, pixelHeight} = latest;
        if ('transferFromImageBitmap' in context) {
            if (displayed) return;
            fallbackCanvas ??= new OffscreenCanvas(pixelWidth, pixelHeight);
            if (fallbackCanvas.width !== pixelWidth || fallbackCanvas.height !== pixelHeight) {
                fallbackCanvas.width = pixelWidth;
                fallbackCanvas.height = pixelHeight;
            }
            const ctx = fallbackCanvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(pixelWidth / frame.width, 0, 0, pixelHeight / frame.height, 0, 0);
            fallback.draw(ctx, data, frame);
            context.transferFromImageBitmap(fallbackCanvas.transferToImageBitmap());
            return;
        }
        context.setTransform(pixelWidth / frame.width, 0, 0, pixelHeight / frame.height, 0, 0);
        if (bitmap) context.drawImage(bitmap, 0, 0, frame.width, frame.height);
        else fallback.draw(context, data, frame);
    };
    const stopWorker = () => {
        if (worker) {
            worker.onmessage = null;
            worker.onerror = null;
            worker.terminate();
        }
        worker = null;
        directCanvas?.remove();
        directCanvas = undefined;
        inFlight = queued = undefined;
        bitmap?.close();
        bitmap = undefined;
        displayed = false;
    };
    const send = (request: PondRenderRequest) => {
        inFlight = request;
        worker!.postMessage(request);
    };
    const startWorker = () => {
        worker = null;
        if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
        try {
            worker = new Worker(new URL('./pond.worker.ts', import.meta.url), {type: 'module'});
            worker.onmessage = ({data: {bitmap: next}}: MessageEvent<PondRenderResult>) => {
                const completed = inFlight;
                inFlight = undefined;
                // Resize and Still mode changes must not be overwritten by an older frame.
                if (completed && latest && completed.pixelWidth === latest.pixelWidth && completed.pixelHeight === latest.pixelHeight
                    && ((latest.frame.motionEnabled ?? latest.frame.moving) || completed.frame.ambientTime === latest.frame.ambientTime)) {
                    if (!next && directCanvas && context) {
                        directCanvas.style.opacity = '1';
                        displayed = true;
                    } else if (next && context && 'transferFromImageBitmap' in context) {
                        if (directCanvas) directCanvas.style.opacity = '0';
                        context.transferFromImageBitmap(next);
                        displayed = true;
                    } else if (next) {
                        if (directCanvas) directCanvas.style.opacity = '0';
                        bitmap?.close();
                        bitmap = next;
                        paint();
                    }
                } else next?.close();
                if (queued) {
                    const request = queued;
                    queued = undefined;
                    send(request);
                }
            };
            worker.onerror = event => {
                event.preventDefault();
                stopWorker();
                paint();
            };
            const placeholder = context?.canvas;
            if (placeholder instanceof HTMLCanvasElement && placeholder.parentElement
                && typeof placeholder.transferControlToOffscreen === 'function') {
                try {
                    directCanvas = document.createElement('canvas');
                    directCanvas.className = placeholder.className;
                    directCanvas.dataset.pondDirect = '';
                    directCanvas.setAttribute('aria-hidden', 'true');
                    directCanvas.style.pointerEvents = 'none';
                    directCanvas.style.opacity = '0';
                    placeholder.insertAdjacentElement('afterend', directCanvas);
                    const target = directCanvas.transferControlToOffscreen();
                    worker.postMessage({target}, [target]);
                } catch {
                    directCanvas?.remove();
                    directCanvas = undefined;
                }
            }
        } catch {
            stopWorker();
        }
    };
    const draw = (ctx: CanvasRenderingContext2D | ImageBitmapRenderingContext, data: Pond, frame: SceneFrame<Pond>) => {
        if (frame.width <= 0 || frame.height <= 0) return;
        if (latest && (latest.pixelWidth !== ctx.canvas.width || latest.pixelHeight !== ctx.canvas.height)) displayed = false;
        context = ctx;
        latest = {data, frame, pixelWidth: ctx.canvas.width, pixelHeight: ctx.canvas.height};
        paint();
        if (worker === undefined) startWorker();
        if (!worker) return;
        // At most one render is in progress; replace queued work with the newest frame.
        if (inFlight) queued = latest;
        else send(latest);
    };
    return {
        dispose() {
            stopWorker();
            worker = undefined;
            latest = undefined;
            context = undefined;
            fallback.dispose();
            if (fallbackCanvas) fallbackCanvas.width = fallbackCanvas.height = 1;
            fallbackCanvas = undefined;
        },
        draw,
        drawBitmap: draw,
    };
}
