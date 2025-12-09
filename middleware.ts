import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimit = new Map<string, { apiCount: number, audioCount: number, shareCount: number, shareTimestamp: number, timestamp: number }>();

const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW, 10) : 60000;
const MAX_REQUESTS_PER_WINDOW = process.env.MAX_REQUESTS_PER_WINDOW ? parseInt(process.env.MAX_REQUESTS_PER_WINDOW, 10) : 100;
const AUDIO_FILE_LIMIT = process.env.AUDIO_FILE_LIMIT ? parseInt(process.env.AUDIO_FILE_LIMIT, 10) : 10;
const SHARE_REQUEST_LIMIT = process.env.SHARE_REQUEST_LIMIT ? parseInt(process.env.SHARE_REQUEST_LIMIT, 10) : 3;
const SHARE_LIMIT_WINDOW = process.env.SHARE_LIMIT_WINDOW ? parseInt(process.env.SHARE_LIMIT_WINDOW, 10) : 86400000; // 24 hours in ms

export function middleware(request: NextRequest) {
    const ip = request.headers.get('cf-connecting-ip') || 
               request.headers.get('x-real-ip') ||
               request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
               'unknown-ip';
    const now = Date.now();

    const isAudioRequest = request.nextUrl.pathname.match(/\.(mp3|wav|ogg|flac|aac|m4a|opus)$/i);
    const isImageRequest = request.nextUrl.pathname.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isShareRequest = request.nextUrl.pathname === '/api/share' && request.method === 'POST';
    const isRangeRequest = request.headers.has('range');

    let limit = MAX_REQUESTS_PER_WINDOW;
    if (isAudioRequest) limit = AUDIO_FILE_LIMIT;
    if (isShareRequest) limit = SHARE_REQUEST_LIMIT;

    const rateLimitData = rateLimit.get(ip) || { 
        apiCount: 0, 
        audioCount: 0, 
        shareCount: 0,
        shareTimestamp: now,
        timestamp: now 
    };

    // Reset regular API and audio counters on window expiry
    if (now - rateLimitData.timestamp > RATE_LIMIT_WINDOW) {
        rateLimitData.audioCount = 0;
        rateLimitData.apiCount = 0;
        rateLimitData.timestamp = now;
    }
    
    // Reset share counter on its own longer window
    if (now - rateLimitData.shareTimestamp > SHARE_LIMIT_WINDOW) {
        rateLimitData.shareCount = 0;
        rateLimitData.shareTimestamp = now;
    }

    // Increment the appropriate counter (skip images and audio range requests)
    if (isShareRequest) {
        rateLimitData.shareCount++;
    } else if (!isImageRequest && !(isAudioRequest && isRangeRequest)) {
        rateLimitData[isAudioRequest ? 'audioCount' : 'apiCount']++;
    }
    rateLimit.set(ip, rateLimitData);

    // Occasionally clean up expired entries
    if (Math.random() < 0.01) {
        for (const [key, value] of rateLimit) {
            if (now - value.timestamp > RATE_LIMIT_WINDOW && 
                now - value.shareTimestamp > SHARE_LIMIT_WINDOW) {
                rateLimit.delete(key);
            }
        }
    }

    if (isShareRequest && rateLimitData.shareCount > limit) {
        const response = NextResponse.json(
            { 
                error: 'Too many requests', 
                message: `You've reached the limit of ${limit} artist requests per day. Please try again tomorrow.`,
                limit,
                current: rateLimitData.shareCount 
            },
            { status: 429 }
        );
        
        response.headers.set('Retry-After', String(Math.ceil(SHARE_LIMIT_WINDOW / 1000)));
        return response;
    } else if ((isAudioRequest && rateLimitData.audioCount > limit) || 
              (!isShareRequest && !isAudioRequest && rateLimitData.apiCount > limit)) {
        const response = NextResponse.json(
            { error: 'Too many requests', limit, current: isAudioRequest ? rateLimitData.audioCount : rateLimitData.apiCount },
            { status: 429 }
        );
        
        response.headers.set('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW / 1000)));
        return response;
    }

    const response = NextResponse.next();

    // Set security headers
    response.headers.set('X-RateLimit-Limit', String(limit));

    // Add Content-Security-Policy header
    response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " + // Allow inline styles for Tailwind
        "img-src 'self' data: blob:; " + // Allow data: for inline images and blob: for dynamic content
        "media-src 'self' blob:; " + // For audio files
        "connect-src 'self'; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'; " + // Prevents clickjacking
        "block-all-mixed-content; " +
        "upgrade-insecure-requests;"
    );
    
    // Add additional security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Set rate limit headers
    if (isShareRequest) {
        response.headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - rateLimitData.shareCount)));
        response.headers.set('X-RateLimit-Reset', String(rateLimitData.shareTimestamp + SHARE_LIMIT_WINDOW));
    } else {
        response.headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - (isAudioRequest ? rateLimitData.audioCount : rateLimitData.apiCount))));
        response.headers.set('X-RateLimit-Reset', String(rateLimitData.timestamp + RATE_LIMIT_WINDOW));
    }
    
    return response;
}

export const config = {
    matcher: [
        '/audio/:path*',
        '/api/share',
        '/browse/:path*',
        '/share/:path*',
        '/((?!_next/static|_next/image).*)',
    ],
};