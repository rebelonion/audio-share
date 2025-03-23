import type { Metadata } from 'next';
import React from "react";

export const metadata: Metadata = {
    title: 'Shared Audio - Audio Share',
    description: 'Shared audio file from Audio Share',
};

export default function ShareLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen">
            {children}
        </div>
    );
}