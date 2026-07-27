/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contactTopicFromSearch } from '@/lib/contact';
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
