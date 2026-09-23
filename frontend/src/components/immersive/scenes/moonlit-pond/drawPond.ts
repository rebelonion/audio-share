import type {PondContext} from './pondCanvas';
import type {SceneFrame} from '../types';
import {mixPalette} from '../shared/sceneTransition';
import {sampleSceneWaveform} from '../shared/scenery';
import {fishPose, pondSpan, positionPads, rainDrops, type Pond} from './pond';
import {drawFish} from './drawFish';
import {createPadRenderer, drawSplashes} from './drawPads';
import {createWaterSurface, drawWaterFallback} from './waterSurface';

export function createPondRenderer(waterCanvas?: OffscreenCanvas) {
    const padRenderer = createPadRenderer();
    let surface: ReturnType<typeof createWaterSurface> | undefined;
    return {
        dispose() {
            padRenderer.dispose();
            surface?.dispose();
            surface = undefined;
        },
        draw(ctx: PondContext, data: Pond, frame: SceneFrame<Pond>) {
            const {width, height, ambientTime: time, layers} = frame;
            if (width <= 0 || height <= 0) return;
            if (surface === undefined) surface = waterCanvas ? createWaterSurface(waterCanvas) : null;
            const palette = mixPalette(layers.map(layer => ({palette: layer.data.palette, weight: layer.weight})));
            const pads = positionPads(data.pads, time, width, height);
            const drops = rainDrops(data.seed, time, width, height, data.pads);
            const scale = Math.min(width, height);
            ctx.save();
            ctx.beginPath();
            ctx.globalAlpha = 1;
            const useGpu = surface?.available() ?? false;
            const drawUnderwater = (background: boolean) => {
                ctx.clearRect(0, 0, width, height);
                if (background) {
                    const depth = ctx.createRadialGradient(width * 0.58, height * 0.37, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.73);
                    depth.addColorStop(0, palette.water);
                    depth.addColorStop(0.55, palette.edge);
                    depth.addColorStop(1, palette.deep);
                    ctx.fillStyle = depth;
                    ctx.fillRect(0, 0, width, height);
                }
                // Submerged stems sit below both fish and the reflected sky.
                ctx.strokeStyle = '#153d39';
                ctx.globalAlpha = 0.22;
                ctx.lineWidth = Math.max(1, scale * 0.002);
                for (const pad of pads) {
                    ctx.beginPath();
                    ctx.moveTo(pad.x, pad.y);
                    ctx.bezierCurveTo(pad.x + scale * 0.04, pad.y + scale * 0.08, pad.x - scale * 0.025, pad.y + scale * 0.14, pad.x + scale * 0.01, pad.y + scale * 0.2);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                const fish = [...data.fish].sort((a, b) => fishPose(b, time, width, height).depth - fishPose(a, time, width, height).depth);
                for (const koi of fish) drawFish(ctx, koi, time, width, height);
            };
            drawUnderwater(!useGpu);
            const shimmer = sampleSceneWaveform(layers, pond => pond.shimmer, pondSpan, 0) * 0.5 + (frame.audioLevel ?? 0) * 0.5;
            const drawForeground = (shadeBackground: boolean) => {
                padRenderer.draw(ctx, pads, drops, time, width, height, palette);
                drawSplashes(ctx, drops, scale);
                if (!shadeBackground) return;
                const shade = ctx.createRadialGradient(width * 0.5, height * 0.45, scale * 0.24, width * 0.5, height * 0.45, Math.max(width, height) * 0.76);
                shade.addColorStop(0, 'rgba(1, 9, 17, 0)');
                shade.addColorStop(1, 'rgba(1, 9, 17, 0.6)');
                ctx.fillStyle = shade;
                ctx.fillRect(0, 0, width, height);
            };
            const composed = useGpu ? surface!.draw(ctx, width, height, time, drops, shimmer, palette, () => drawForeground(false)) : null;
            if (!composed) {
                if (useGpu) drawUnderwater(true);
                drawWaterFallback(ctx, width, height, time, drops);
                drawForeground(true);
            }
            ctx.restore();
            return composed;
        },
    };
}
