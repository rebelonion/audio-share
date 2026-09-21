import {useEffect, useRef, type PointerEvent} from 'react';
import {smoothAudioLevel} from '@/lib/audioLevel';
import {clamp} from '@/lib/utils';
import type {SceneFrame, ScenePlaybackProps} from '../types';
import {SceneTransition} from './sceneTransition';
import {createSceneClock} from './sceneClock';
import {SCENE_TRAVEL_DISTANCE} from './scenery';
import './SceneCanvas.css';

const AUDIO_REACTIVITY = 0.6;

interface SceneCanvasProps<T> extends ScenePlaybackProps {
    data: T;
    renderFrame: (ctx: CanvasRenderingContext2D, data: T, frame: SceneFrame<T>) => void;
    travelSpan: (duration: number) => number;
    seekFromDrag: (time: number, deltaX: number, travelDistance: number, duration: number) => number;
    className: string;
}

export default function SceneCanvas<T>({data, renderFrame, travelSpan, seekFromDrag, className, ...props}: SceneCanvasProps<T>) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const latest = useRef({...props, data, renderFrame, travelSpan});
    latest.current = {...props, data, renderFrame, travelSpan};
    const pointer = useRef({x: 0, y: 0});
    const drag = useRef<{pointerId: number; x: number; time: number; target: number; moved: boolean} | null>(null);
    const redraw = useRef<() => void>(() => {});
    const updateMotion = useRef<() => void>(() => {});

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', {alpha: false});
        if (!canvas || !ctx) return;
        let width = 0;
        let height = 0;
        let animation = 0;
        let lastFrame = performance.now();
        let audioLevel = 0;
        const clock = createSceneClock(latest.current, lastFrame, duration => latest.current.travelSpan(duration));
        const transition = new SceneTransition<T>(duration => latest.current.travelSpan(duration));

        const draw = (now: number) => {
            const current = latest.current;
            lastFrame = now;
            const {elapsed, ...frame} = clock.step(now, current, pointer.current);
            if (current.motion) {
                const target = !document.hidden && current.isPlaying && !current.isLoading && current.previewTime === null
                    ? current.readAudioLevel?.() ?? 0 : 0;
                audioLevel = smoothAudioLevel(audioLevel, target, elapsed);
            }
            current.renderFrame(ctx, current.data, {
                width, height, ...frame, audioLevel: audioLevel * AUDIO_REACTIVITY,
                layers: transition.update(current.data, current.trackKey, frame.time, current.duration, frame.travel, elapsed, current.motion),
            });
        };

        const tick = (now: number) => {
            if (now - lastFrame >= 1000 / 30) draw(now);
            animation = requestAnimationFrame(tick);
        };
        const resize = () => {
            const bounds = canvas.getBoundingClientRect();
            width = bounds.width;
            height = bounds.height;
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            draw(performance.now());
        };
        const updateVisibility = () => {
            cancelAnimationFrame(animation);
            if (document.hidden) return;
            lastFrame = performance.now();
            clock.resume(lastFrame);
            draw(lastFrame);
            if (latest.current.motion) animation = requestAnimationFrame(tick);
        };
        redraw.current = () => {
            if (!document.hidden) draw(performance.now());
        };
        updateMotion.current = updateVisibility;
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        document.addEventListener('visibilitychange', updateVisibility);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(animation);
            document.removeEventListener('visibilitychange', updateVisibility);
            redraw.current = () => {};
            updateMotion.current = () => {};
        };
    }, []);

    useEffect(() => {
        updateMotion.current();
    }, [props.motion]);

    useEffect(() => {
        if (!props.motion) redraw.current();
    }, [data, renderFrame, props.trackKey, props.currentTime, props.seekVersion, props.previewTime, props.isPlaying, props.duration, props.motion]);

    useEffect(() => {
        const active = drag.current;
        if (!active) return;
        drag.current = null;
        latest.current.onPreview(null);
        if (canvasRef.current?.hasPointerCapture(active.pointerId)) canvasRef.current.releasePointerCapture(active.pointerId);
    }, [props.trackKey]);

    const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.pointerType === 'mouse') {
            pointer.current = {
                x: clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1),
                y: clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1),
            };
        }
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const delta = event.clientX - drag.current.x;
        drag.current.moved ||= Math.abs(delta) > 4;
        if (!drag.current.moved) return;
        drag.current.target = seekFromDrag(drag.current.time, delta, SCENE_TRAVEL_DISTANCE, props.duration);
        props.onPreview(drag.current.target);
    };

    const endDrag = (event: PointerEvent<HTMLCanvasElement>, commit: boolean) => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        if (commit && drag.current.moved) {
            props.onSeek(drag.current.target);
        }
        drag.current = null;
        props.onPreview(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return <canvas
        ref={canvasRef}
        className={`immersive-canvas ${className}`}
        aria-hidden="true"
        onPointerDown={event => {
            if (!props.canSeek || !event.isPrimary || event.button !== 0) return;
            drag.current = {pointerId: event.pointerId, x: event.clientX, time: props.currentTime, target: props.currentTime, moved: false};
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={event => endDrag(event, true)}
        onPointerCancel={event => endDrag(event, false)}
        onLostPointerCapture={event => endDrag(event, false)}
        onPointerLeave={() => { pointer.current = {x: 0, y: 0}; }}
    />;
}
