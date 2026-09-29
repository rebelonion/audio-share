/** @vitest-environment jsdom */
import {useState} from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import CustomSelect from './CustomSelect';
import Dialog from './ui/Dialog';

afterEach(cleanup);

it('keeps its menu inside a dialog and restores trigger focus on selection and Escape', async () => {
    const dismiss = vi.fn();
    function Harness() {
        const [value, setValue] = useState('1');
        return <Dialog open onClose={dismiss} labelledBy="settings-title">
            <h2 id="settings-title">Settings</h2>
            <CustomSelect ariaLabel="Speed" value={value} onChange={setValue}
                options={[{value: '1', label: 'Normal'}, {value: '2', label: 'Fast'}]} />
        </Dialog>;
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', {name: 'Speed'});
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    const menu = within(screen.getByRole('dialog')).getByRole('listbox');
    await waitFor(() => expect(menu.closest('[inert]')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('option', {name: 'Normal'}));
    fireEvent.keyDown(document.activeElement!, {key: 'End'});
    expect(document.activeElement).toBe(screen.getByRole('option', {name: 'Fast'}));
    fireEvent.click(document.activeElement!);
    expect(trigger.textContent).toBe('Fast');
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(dismiss).not.toHaveBeenCalled();
});

it('closes and prevents selection when disabled while open', () => {
    const onChange = vi.fn();
    const props = {ariaLabel: 'Filter', value: 'all', onChange, options: [{value: 'all', label: 'All'}]};
    const view = render(<CustomSelect {...props} />);
    fireEvent.click(screen.getByRole('button', {name: 'Filter'}));
    view.rerender(<CustomSelect {...props} disabled />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((screen.getByRole('button', {name: 'Filter'}) as HTMLButtonElement).disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
});
