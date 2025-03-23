import {NextRequest, NextResponse} from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.requestUrl || typeof body.requestUrl !== 'string') {
            return NextResponse.json({error: 'Invalid URL'}, {status: 400});
        }

        try {
            new URL(body.requestUrl);
        } catch {
            return NextResponse.json({error: 'Please enter a valid URL'}, {status: 400});
        }

        const ntfyUrl = process.env.NTFY_URL;
        const ntfyTopic = process.env.NTFY_TOPIC;
        const ntfyToken = process.env.NTFY_TOKEN;
        const priority = parseInt(process.env.NTFY_PRIORITY || '1', 10);

        if (!ntfyUrl || !ntfyTopic || !ntfyToken) {
            console.error('NTFY_URL or NTFY_TOPIC environment variables are not set');
            return NextResponse.json({error: 'Server configuration error'}, {status: 500});
        }

        const ntfyEndpoint = `${ntfyUrl}/${ntfyTopic}`;

        const response = await fetch(ntfyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Title': 'New Audio Source Request',
                'X-Priority': priority.toString(),
                'X-Tags': 'audio,request,source',
                'Authorization': `Bearer ${ntfyToken}`
            },
            body: `New source request: ${body.requestUrl}`
        });

        if (!response.ok) {
            return NextResponse.json({error: 'Failed to send notification'}, {status: 500});
        }

        return NextResponse.json({success: true});
    } catch (error) {
        console.error('Error forwarding request to ntfy:', error);
        return NextResponse.json({error: 'Failed to process request'}, {status: 500});
    }
}