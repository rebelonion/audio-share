/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserFromUserAgent, contactTopicFromSearch } from '@/lib/contact';
import Contact from './Contact';

vi.mock('@/hooks/useRybbit', () => ({
    useRybbit: () => ({ track: vi.fn() }),
}));

afterEach(cleanup);

describe('Contact topic links', () => {
    it('accepts known topic values from the query string', () => {
        expect(contactTopicFromSearch('?topic=bug')).toBe('bug');
        expect(contactTopicFromSearch('?topic=feature&utm_source=footer')).toBe('feature');
    });

    it('ignores unknown or missing topic values', () => {
        expect(contactTopicFromSearch('?topic=unknown')).toBe('');
        expect(contactTopicFromSearch('')).toBe('');
    });

    it('shows the linked topic as selected', () => {
        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={['/contact?topic=abuse']}>
                    <Contact />
                </MemoryRouter>
            </HelmetProvider>,
        );

        expect(screen.getByRole('button', { name: 'Topic *' }).textContent).toContain('Abuse');
        expect(screen.getByLabelText('Email *').hasAttribute('required')).toBe(true);
    });
});

describe('Contact diagnostics', () => {
    it('identifies common browsers from their user agents', () => {
        expect(browserFromUserAgent(
            'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
        )).toBe('Edge 126.0.0.0');
        expect(browserFromUserAgent(
            'Mozilla/5.0 Version/17.5 Safari/605.1.15',
        )).toBe('Safari 17.5');
        expect(browserFromUserAgent(
            'Mozilla/5.0 Firefox/127.0',
        )).toBe('Firefox 127.0');
    });
});
