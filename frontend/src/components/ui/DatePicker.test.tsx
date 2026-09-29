/** @vitest-environment jsdom */
import {useState} from 'react';
import {afterEach, expect, it} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import DatePicker from './DatePicker';

afterEach(cleanup);

function Harness() {
    const [value, setValue] = useState('2025-12-31');
    return <DatePicker value={value} onChange={setValue} placeholder="From" />;
}

it('closes on Escape and restores focus to the date field', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', {name: 'From: December 31, 2025'});
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Close calendar'}));
    fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
});

it('selects across a year boundary and clears with a separate accessible button', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', {name: 'From: December 31, 2025'}));
    fireEvent.click(screen.getByRole('button', {name: 'Next month'}));
    fireEvent.click(screen.getByRole('button', {name: 'January 2, 2026'}));
    const trigger = screen.getByRole('button', {name: 'From: January 2, 2026'});
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(screen.getByRole('button', {name: 'Clear from date'}));
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'From'}));
    expect(screen.queryByRole('button', {name: 'Clear from date'})).toBeNull();
});

it('keeps focus inside the calendar when switching from months to days', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', {name: 'From: December 31, 2025'}));
    fireEvent.click(screen.getByRole('button', {name: 'Choose month'}));
    fireEvent.click(screen.getByRole('button', {name: 'February 2025'}));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('button', {name: 'February 28, 2025'})).toBeTruthy();
    expect(screen.queryByRole('button', {name: 'February 29, 2025'})).toBeNull();
});
