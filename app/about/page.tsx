// noinspection JSUnusedGlobalSymbols

import {Metadata} from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import fs from 'fs';
import path from 'path';

export const metadata: Metadata = {
    title: (process.env.DEFAULT_TITLE ? process.env.DEFAULT_TITLE + ' - About' : 'Audio Archive - About'),
    description: 'About this audio sharing application'
};

export const dynamic = 'force-dynamic';

const markdownPath = path.join(process.cwd(), 'content', 'about.md');
let markdown = '';

try {
    markdown = fs.readFileSync(markdownPath, 'utf-8');
} catch (error) {
    console.error('Error reading content/about.md:', error);
    markdown = '# About\n\nPlease create a `content/about.md` file to customize this page.';
}

export default function AboutPage() {
    return (
        <div className="max-w-4xl mx-auto">
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
    );
}
