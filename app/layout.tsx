import type {Metadata} from "next";
import {Music} from 'lucide-react';
import "./globals.css";
import React from "react";
import Link from "next/link";
import FloatingActionButton from "@/components/FloatingActionButton";

export const metadata: Metadata = {
    title: process.env.DEFAULT_TITLE || "Audio Archive",
    description: process.env.DEFAULT_DESCRIPTION || "Browse and listen to audio files",
    icons: {
        icon: '/favicon.svg',
    },
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
        <body
            className={`bg-[var(--background)] text-[var(--foreground)] min-h-screen flex flex-col`}
        >
        <header className="bg-[var(--card)] shadow-md border-b border-[var(--border)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <div className="flex items-center justify-between">
                    <Link href="/" className="flex items-center group">
                        <Music className="h-8 w-8 text-[var(--primary)] mr-3 group-hover:text-[var(--primary-hover)] transition-colors"/>
                        <h1 className="text-2xl font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
                            {metadata.title?.toString()}
                        </h1>
                    </Link>
                    <Link
                        href="/about"
                        className="text-[var(--foreground)] hover:text-[var(--primary)] pr-12 transition-colors font-medium"
                    >
                        About
                    </Link>
                </div>
            </div>
        </header>

        <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow">
            <div className="w-full overflow-x-auto">
                {children}
            </div>
        </main>

        <FloatingActionButton/>

        <footer className="bg-[var(--card)] border-t border-[var(--border)] mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <div className="flex justify-center items-center mb-2">
                    <Link href="https://github.com/rebelonion/audio-share" target="_blank" rel="noopener noreferrer"
                          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                        <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
                             className="h-6 w-6 fill-current">
                            <title>GitHub</title>
                            <path
                                d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                        </svg>
                    </Link>
                </div>
                <p className="text-center text-[var(--muted-foreground)] text-sm">
                    {metadata.description}
                </p>
                <p className="text-center text-[var(--muted-foreground)] text-sm mt-1">
                    © {new Date().getFullYear()} rebelonion. Licensed under the MIT License.
                </p>
            </div>
        </footer>
        </body>
        </html>
    );
}