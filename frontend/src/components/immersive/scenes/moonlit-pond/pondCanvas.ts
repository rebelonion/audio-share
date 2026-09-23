import type {SceneFrame} from '../types';
import type {Pond} from './pond';

export type PondContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface PondRenderRequest {
    data: Pond;
    frame: SceneFrame<Pond>;
    pixelWidth: number;
    pixelHeight: number;
}

export interface PondRenderResult {
    bitmap?: ImageBitmap;
}

export type PondWorkerMessage = PondRenderRequest | {target: OffscreenCanvas};
