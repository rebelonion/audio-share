import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE } from '@/lib/api';
import { DEFAULT_TITLE } from '@/lib/config';

export default function About() {
    const [markdown, setMarkdown] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchAbout() {
            try {
                const response = await fetch(`${API_BASE}/api/about`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch about content: ${response.status}`);
                }
                const data = await response.json();
                setMarkdown(data.content);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load about content');
                setMarkdown('# About\n\nPlease create a `content/about.md` file to customize this page.');
            } finally {
                setLoading(false);
            }
        }
        fetchAbout();
    }, []);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto">
                <div className="animate-pulse">
                    <div className="h-10 bg-[var(--border)] rounded w-1/3 mb-6"></div>
                    <div className="space-y-4">
                        <div className="h-4 bg-[var(--border)] rounded w-full"></div>
                        <div className="h-4 bg-[var(--border)] rounded w-5/6"></div>
                        <div className="h-4 bg-[var(--border)] rounded w-4/6"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>{DEFAULT_TITLE} - About</title>
                <meta name="description" content="About this audio sharing application" />
            </Helmet>
            <div className="max-w-4xl mx-auto">
                {error && (
                    <div className="mb-4 p-3 bg-yellow-900/20 text-yellow-400 rounded-lg">
                        Note: Using default content. {error}
                    </div>
                )}
                <div className="prose prose-invert prose-lg max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: (props) => (
                                <h1 className="text-4xl font-bold mb-6 text-[var(--foreground)]" {...props} />
                            ),
                            h2: (props) => (
                                <h2 className="text-3xl font-bold mt-8 mb-4 text-[var(--foreground)]" {...props} />
                            ),
                            h3: (props) => (
                                <h3 className="text-2xl font-bold mt-6 mb-3 text-[var(--foreground)]" {...props} />
                            ),
                            p: (props) => (
                                <p className="text-[var(--foreground)] mb-4 leading-relaxed" {...props} />
                            ),
                            a: (props) => (
                                <a
                                    className="text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors underline"
                                    {...props}
                                />
                            ),
                            ul: (props) => (
                                <ul className="list-disc list-inside mb-4 text-[var(--foreground)] space-y-2" {...props} />
                            ),
                            ol: (props) => (
                                <ol className="list-decimal list-inside mb-4 text-[var(--foreground)] space-y-2" {...props} />
                            ),
                            li: (props) => (
                                <li className="text-[var(--foreground)] ml-4" {...props} />
                            ),
                            code: (props) => (
                                <code
                                    className="bg-[var(--card)] text-[var(--primary)] px-1.5 py-0.5 rounded text-sm font-mono"
                                    {...props}
                                />
                            ),
                            pre: (props) => (
                                <pre className="bg-[var(--card)] p-4 rounded-lg overflow-x-auto mb-4" {...props} />
                            ),
                            blockquote: (props) => (
                                <blockquote
                                    className="border-l-4 border-[var(--primary)] pl-4 italic text-[var(--muted-foreground)] my-4"
                                    {...props}
                                />
                            ),
                            hr: (props) => (
                                <hr className="border-[var(--border)] my-8" {...props} />
                            ),
                            table: (props) => (
                                <div className="overflow-x-auto mb-4">
                                    <table className="min-w-full border-collapse border border-[var(--border)]" {...props} />
                                </div>
                            ),
                            th: (props) => (
                                <th className="border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-left text-[var(--foreground)] font-bold" {...props} />
                            ),
                            td: (props) => (
                                <td className="border border-[var(--border)] px-4 py-2 text-[var(--foreground)]" {...props} />
                            ),
                            strong: (props) => (
                                <strong className="font-bold text-[var(--foreground)]" {...props} />
                            ),
                            em: (props) => (
                                <em className="italic text-[var(--foreground)]" {...props} />
                            )
                        }}
                    >
                        {markdown}
                    </ReactMarkdown>
                </div>
            </div>
        </>
    );
}
