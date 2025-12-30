import {NextRequest, NextResponse} from 'next/server';
import {createReadStream, stat as fsStat, ReadStream} from 'fs';
import fs from 'fs';
import path from 'path';
import {promisify} from 'util';
import {getSlugToDirectoryMap} from '@/lib/fileSystem';

const stat = promisify(fsStat);

function createSafeWebStream(fileStream: ReadStream, requestSignal?: AbortSignal): ReadableStream {
    let isClosed = false;

    if (requestSignal) {
        requestSignal.addEventListener('abort', () => {
            isClosed = true;
            if (fileStream && !fileStream.destroyed) {
                fileStream.destroy();
            }
        });
    }

    return new ReadableStream({
        start(controller) {
            fileStream.on('data', (chunk: string | Buffer) => {
                if (isClosed) return;

                try {
                    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
                    controller.enqueue(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
                } catch {
                    isClosed = true;
                    if (!fileStream.destroyed) {
                        fileStream.destroy();
                    }
                }
            });

            fileStream.on('end', () => {
                if (isClosed) return;

                try {
                    controller.close();
                    isClosed = true;
                } catch {
                    // Controller already closed
                }

                if (!fileStream.destroyed) {
                    fileStream.destroy();
                }
            });

            fileStream.on('error', (streamError: NodeJS.ErrnoException) => {
                if (streamError.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
                    streamError.code === 'ECONNRESET') {
                    return;
                }

                if (!isClosed) {
                    console.error('Stream error:', streamError);
                    try {
                        controller.error(streamError);
                        isClosed = true;
                    } catch {
                        // Controller already errored
                    }
                }

                if (!fileStream.destroyed) {
                    fileStream.destroy();
                }
            });
        },

        cancel() {
            isClosed = true;
            if (fileStream && !fileStream.destroyed) {
                fileStream.destroy();
            }
        }
    });
}

export async function GET(
    request: NextRequest,
    {params}: { params: Promise<{ path: string[] }> }
) {
    try {
    const resolvedParams = await params;
    const filePath = resolvedParams.path.join('/');

    const slugToDir = getSlugToDirectoryMap();

    const pathParts = filePath.split('/');
    const dirSlug = pathParts[0];

    if (!slugToDir[dirSlug]) {
        return new NextResponse(`Invalid directory: ${dirSlug}`, {status: 400});
    }

    // Get the target directory from the slug map
    const targetDir = slugToDir[dirSlug].path;

    // Get the relative path within the directory (everything after the slug)
    const actualFilePath = pathParts.slice(1).join('/');

    const normalizedPath = path.normalize(actualFilePath);
    if (normalizedPath.startsWith('..') || normalizedPath.startsWith('/') || 
        normalizedPath.includes('/../') || normalizedPath.endsWith('/..')) {
        console.error('Directory traversal attempt blocked in audio API:', filePath);
        return new NextResponse('Invalid path', {status: 400});
    }

    const fullPath = path.join(targetDir, normalizedPath);

    try {
        const stats = await stat(fullPath);

        if (!stats.isFile()) {
            return new NextResponse('Not a file', {status: 400});
        }

        const ext = path.extname(fullPath).toLowerCase();
        let contentType = 'application/octet-stream'; // Default

        if (ext === '.mp3') contentType = 'audio/mpeg';
        if (ext === '.wav') contentType = 'audio/wav';
        if (ext === '.ogg') contentType = 'audio/ogg';
        if (ext === '.flac') contentType = 'audio/flac';
        if (ext === '.aac') contentType = 'audio/aac';
        if (ext === '.m4a') contentType = 'audio/mp4';
        if (ext === '.opus') contentType = 'audio/opus';

        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        if (ext === '.png') contentType = 'image/png';
        if (ext === '.gif') contentType = 'image/gif';
        if (ext === '.webp') contentType = 'image/webp';

        const cacheControl = contentType.startsWith('image/') 
            ? 'public, max-age=86400' // Cache images for 24 hours
            : 'public, max-age=3600'; // Cache other files for 1 hour
            
        if (ext === '.json') {
            contentType = 'application/json';
            try {
                const fileContents = await fs.promises.readFile(fullPath, 'utf-8');
                return new NextResponse(fileContents, {
                    headers: {
                        'Content-Type': contentType,
                        'Content-Length': stats.size.toString(),
                        'Cache-Control': cacheControl,
                    },
                });
            } catch (jsonError) {
                console.error('Invalid JSON file:', jsonError);
                return new NextResponse('Invalid JSON file', {status: 500});
            }
        }

        try {
            if (request.headers.get('range') && contentType.startsWith('audio/')) {
                const range = request.headers.get('range');
                const parts = range?.replace(/bytes=/, '').split('-');
                const start = parseInt(parts?.[0] || '0', 10);
                const end = parts?.[1] ? parseInt(parts[1], 10) : stats.size - 1;

                const chunkSize = end - start + 1;
                const fileStream = createReadStream(fullPath, {start, end});
                const webStream = createSafeWebStream(fileStream, request.signal);

                return new NextResponse(webStream, {
                    status: 206,
                    headers: {
                        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunkSize.toString(),
                        'Content-Type': contentType,
                        'Cache-Control': cacheControl,
                    }
                });
            }

            const fileStream = createReadStream(fullPath);
            const webStream = createSafeWebStream(fileStream, request.signal);

            return new NextResponse(webStream, {
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': stats.size.toString(),
                    'Cache-Control': cacheControl
                },
            });
        } catch (streamError) {
            console.error('Error creating stream:', streamError);
            return new NextResponse('Error streaming file', {status: 500});
        }
    } catch (error) {
        console.error('Error serving audio file:', error);
        return new NextResponse('File not found', {status: 404});
    }
    } catch (uncaughtError) {
        console.error('Uncaught error in API route:', uncaughtError);
        return new NextResponse('Internal Server Error', {status: 500});
    }
}