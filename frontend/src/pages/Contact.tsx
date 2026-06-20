import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from 'react-helmet-async';
import { useRybbit } from '@/hooks/useRybbit';
import { API_BASE } from '@/lib/api';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';
import CustomSelect from '@/components/CustomSelect';

export default function Contact() {
    const { track } = useRybbit();
    const [topic, setTopic] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const navigate = useNavigate();

    const topicOptions = [
        { value: 'general', label: 'General Question' },
        { value: 'bug', label: 'Bug Report' },
        { value: 'feature', label: 'Feature Request' },
        { value: 'content', label: 'Content Issue' },
        { value: 'abuse', label: 'Abuse' },
        { value: 'other', label: 'Other' }
    ];

    const isAbuseReport = topic === 'abuse';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!topic) {
            setSubmitMessage({ type: 'error', text: 'Please select a topic' });
            return;
        }

        if (isAbuseReport && !email.trim()) {
            setSubmitMessage({ type: 'error', text: 'Please enter an email address for abuse reports' });
            return;
        }

        if (!message.trim()) {
            setSubmitMessage({ type: 'error', text: 'Please enter a message' });
            return;
        }

        if (image && !image.type.startsWith('image/')) {
            setSubmitMessage({ type: 'error', text: 'Please attach an image file' });
            return;
        }

        if (image && image.size > 15 * 1024 * 1024) {
            setSubmitMessage({ type: 'error', text: 'Image attachment must be 15 MB or smaller' });
            return;
        }

        setIsSubmitting(true);
        setSubmitMessage(null);

        try {
            const formData = new FormData();
            formData.append('topic', topic);
            formData.append('email', email.trim());
            formData.append('message', message.trim());
            if (image) {
                formData.append('image', image);
            }

            const response = await fetch(`${API_BASE}/api/contact`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                setSubmitMessage({ type: 'success', text: 'Message sent successfully! Thank you for contacting us.' });
                track('contact-form-submit', { topic });
                setTopic('');
                setEmail('');
                setMessage('');
                setImage(null);

                setTimeout(() => {
                    navigate('/');
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
        <>
            <Helmet>
                <title>{DEFAULT_TITLE} - Contact</title>
                <meta name="description" content={`${DEFAULT_DESCRIPTION} — Contact`} />
            </Helmet>
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2 text-[var(--foreground)]">Contact Us</h1>
                    <p className="text-[var(--muted-foreground)]">If you have a comment or question feel free to drop it here.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="topic" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                            Topic <span className="text-[var(--primary)]">*</span>
                        </label>
                        <CustomSelect
                            id="topic"
                            value={topic}
                            onChange={(value) => {
                                setTopic(value);
                                if (value !== 'abuse') {
                                    setImage(null);
                                }
                            }}
                            disabled={isSubmitting}
                            triggerClassName="px-4 py-3 bg-[var(--card)] rounded-lg focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                            options={[
                                { value: '', label: 'Select a topic...' },
                                ...topicOptions,
                            ]}
                        />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                            Email {isAbuseReport ? <span className="text-[var(--primary)]">*</span> : '(optional)'}
                        </label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your.email@example.com"
                            className="w-full px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] transition-colors"
                            disabled={isSubmitting}
                            required={isAbuseReport}
                        />
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            {isAbuseReport ? 'Required so we can follow up on abuse and ownership claims.' : "Provide your email if you'd like a response."}
                        </p>
                    </div>

                    <div>
                        <label htmlFor="message" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                            Message <span className="text-[var(--primary)]">*</span>
                        </label>
                        <textarea
                            id="message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={isAbuseReport ? 'Describe the issue and include proof that you own the content...' : "Tell us what's on your mind..."}
                            rows={8}
                            className="w-full px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] resize-none transition-colors"
                            disabled={isSubmitting}
                        />
                        {isAbuseReport && (
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                You must provide proof of content ownership for abuse or takedown requests.
                            </p>
                        )}
                    </div>

                    {isAbuseReport && (
                        <div>
                            <label htmlFor="image" className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                                Image attachment (optional)
                            </label>
                            <input
                                type="file"
                                id="image"
                                accept="image/*"
                                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                                className="block w-full text-sm text-[var(--foreground)] file:mr-4 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--card)] file:px-4 file:py-2 file:text-[var(--foreground)] file:transition-colors hover:file:bg-[var(--card-hover)] disabled:opacity-50"
                                disabled={isSubmitting}
                            />
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                Screenshots or ownership proof images up to 15 MB are supported.
                            </p>
                        </div>
                    )}

                    {submitMessage && (
                        <div
                            className={`p-4 rounded-lg border ${
                                submitMessage.type === 'success'
                                    ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]'
                                    : 'bg-[var(--error-bg)] border-[var(--error-border)] text-[var(--error-text)]'
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
                            onClick={() => navigate('/')}
                            disabled={isSubmitting}
                            className="px-6 py-3 bg-[var(--card)] hover:bg-[var(--card-hover)] disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border)] rounded-lg font-medium transition-colors text-[var(--foreground)]"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
