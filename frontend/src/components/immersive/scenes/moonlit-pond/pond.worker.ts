import {createPondRenderer} from './drawPond';
import type {PondWorkerMessage} from './pondCanvas';

const canvas = new OffscreenCanvas(1, 1);
const ctx = canvas.getContext('2d');
let renderer = createPondRenderer(new OffscreenCanvas(1, 1));
let target: OffscreenCanvas | undefined;

self.onmessage = ({data: message}: MessageEvent<PondWorkerMessage>) => {
    if ('target' in message) {
        renderer.dispose();
        target = message.target;
        renderer = createPondRenderer(target);
        return;
    }
    const {data, frame, pixelWidth, pixelHeight} = message;
    if (!ctx) throw new Error('Pond canvas unavailable');
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    ctx.setTransform(pixelWidth / frame.width, 0, 0, pixelHeight / frame.height, 0, 0);
    const composed = renderer.draw(ctx, data, frame);
    if (target && composed === target) {
        // The browser presents the worker-owned canvas without an ImageBitmap handoff.
        self.postMessage({});
        return;
    }
    const bitmap = (composed ?? canvas).transferToImageBitmap();
    self.postMessage({bitmap}, {transfer: [bitmap]});
};
