import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { topic, email, message } = body;

        if (!topic || typeof topic !== 'string') {
            return NextResponse.json(
                { error: 'Topic is required' },
                { status: 400 }
            );
        }

        if (!message || typeof message !== 'string' || !message.trim()) {
            return NextResponse.json(
                { error: 'Message is required' },
                { status: 400 }
            );
        }

        if (email && typeof email === 'string') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return NextResponse.json(
                    { error: 'Please enter a valid email address' },
                    { status: 400 }
                );
            }
        }

        const ntfyUrl = process.env.NTFY_URL || 'https://ntfy.sh';
        const ntfyTopic = process.env.NTFY_TOPIC;
        const ntfyToken = process.env.NTFY_TOKEN;
        const ntfyPriority = process.env.NTFY_PRIORITY || '1';

        if (!ntfyTopic) {
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        const topicLabels: Record<string, string> = {
            general: 'General Question',
            bug: 'Bug Report',
            feature: 'Feature Request',
            content: 'Content Issue',
            other: 'Other'
        };

        const topicLabel = topicLabels[topic] || topic;
        const emailInfo = email ? `\nEmail: ${email}` : '\nEmail: Not provided';
        const notificationBody = `Topic: ${topicLabel}${emailInfo}\n\nMessage:\n${message}`;

        const headers: HeadersInit = {
            'Content-Type': 'text/plain',
            'X-Title': 'New Contact Form Submission',
            'X-Priority': ntfyPriority,
            'X-Tags': 'contact,message,form'
        };

        if (ntfyToken) {
            headers['Authorization'] = `Bearer ${ntfyToken}`;
        }

        const ntfyResponse = await fetch(`${ntfyUrl}/${ntfyTopic}`, {
            method: 'POST',
            headers,
            body: notificationBody
        });

        if (!ntfyResponse.ok) {
            console.error('Failed to send ntfy notification:', await ntfyResponse.text());
            return NextResponse.json(
                { error: 'Failed to send notification' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error processing contact form:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
