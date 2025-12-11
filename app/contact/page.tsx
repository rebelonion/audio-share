'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ContactPage() {
    const [topic, setTopic] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const router = useRouter();

    const topicOptions = [
        { value: 'general', label: 'General Question' },
        { value: 'bug', label: 'Bug Report' },
        { value: 'feature', label: 'Feature Request' },
        { value: 'content', label: 'Content Issue' },
        { value: 'other', label: 'Other' }
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!topic) {
            setSubmitMessage({ type: 'error', text: 'Please select a topic' });
            return;
        }

        if (!message.trim()) {
            setSubmitMessage({ type: 'error', text: 'Please enter a message' });
            return;
        }

        setIsSubmitting(true);
        setSubmitMessage(null);

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    topic,
                    email: email.trim() || null,
                    message: message.trim()
                })
            });

            const data = await response.json();

            if (response.ok) {
                setSubmitMessage({ type: 'success', text: 'Message sent successfully! Thank you for contacting us.' });
                setTopic('');
                setEmail('');
                setMessage('');

                setTimeout(() => {
                    router.push('/');
                }, 2000);
            } else {
                setSubmitMessage({ type: 'error', text: data.error || 'Failed to send message' });
            }
        } catch {
            setSubmitMessage({ type: 'error', text: 'Failed to send message. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2 text-[var(--foreground)]">Contact Us</h1>
                <p className="text-[var(--muted-foreground)]">If you have a comment or question feel free to drop it here.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label htmlFor="topic" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                        Topic <span className="text-red-500">*</span>
                    </label>
                    <select
                        id="topic"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="w-full px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-[var(--foreground)] transition-colors"
                        disabled={isSubmitting}
                    >
                        <option value="">Select a topic...</option>
                        {topicOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                        Email (optional)
                    </label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="w-full px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] transition-colors"
                        disabled={isSubmitting}
                    />
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                        Provide your email if you&#39;d like a response.
                    </p>
                </div>

                <div>
                    <label htmlFor="message" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                        Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        id="message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Tell us what's on your mind..."
                        rows={8}
                        className="w-full px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] resize-none transition-colors"
                        disabled={isSubmitting}
                    />
                </div>

                {submitMessage && (
                    <div
                        className={`p-4 rounded-lg border ${
                            submitMessage.type === 'success'
                                ? 'bg-green-900/20 border-green-500/50 text-green-400'
                                : 'bg-red-900/20 border-red-500/50 text-red-400'
                        }`}
                    >
                        {submitMessage.text}
                    </div>
                )}

                <div className="flex gap-4">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-white"
                    >
                        {isSubmitting ? 'Sending...' : 'Send Message'}
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push('/')}
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-[var(--card)] hover:bg-[var(--card-hover)] disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border)] rounded-lg font-medium transition-colors text-[var(--foreground)]"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
