import {NextRequest, NextResponse} from 'next/server';
import {createReadStream, stat as fsStat} from 'fs';
import fs from 'fs';
import path from 'path';
import {promisify} from 'util';
import {Readable} from 'stream';
import {getSlugToDirectoryMap} from '@/lib/fileSystem';

const stat = promisify(fsStat);

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at API route:', promise, 'reason:', reason);
});

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
        if (ext === '.aac' || ext === '.m4a') contentType = 'audio/aac';
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

        let fileStream = null;
        
        try {
            // For audio files
            if (request.headers.get('range') && contentType.startsWith('audio/')) {
                const range = request.headers.get('range');
                const parts = range?.replace(/bytes=/, '').split('-');
                const start = parseInt(parts?.[0] || '0', 10);
                const end = parts?.[1] ? parseInt(parts[1], 10) : stats.size - 1;
    
                const chunkSize = end - start + 1;
                fileStream = createReadStream(fullPath, {start, end});

                fileStream.on('error', (streamError) => {
                    console.error('Stream error:', streamError);
                    // Stream errors are handled automatically by Next.js Response
                });

                const webStream = Readable.toWeb(fileStream) as ReadableStream;
                
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
    
            fileStream = createReadStream(fullPath);
            fileStream.on('error', (streamError) => {
                console.error('Stream error:', streamError);
                // Stream errors are handled automatically by Next.js Response
            });

            const webStream = Readable.toWeb(fileStream) as ReadableStream;
            
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
        // Catch any errors that weren't caught by the inner try/catch
        console.error('Uncaught error in API route:', uncaughtError);
        return new NextResponse('Internal Server Error', {status: 500});
    }
}