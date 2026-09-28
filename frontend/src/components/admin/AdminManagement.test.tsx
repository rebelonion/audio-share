/** @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import AdminRequests from './AdminRequests';
import AdminAudio from './AdminAudio';
import AdminMessages from './AdminMessages';
import * as api from '@/lib/adminManagement';
import {AdminAccessError} from '@/lib/operations';
import type {SourceRequest} from '@/types';

vi.mock('@/lib/adminManagement');
const existing: SourceRequest = {id: 7, title: 'Quiet rain', submittedUrl: 'https://example.test/rain', status: 'requested', tags: [{name: 'ASMR', color: '#c4882a'}], folderShareKey: 'folder-1', createdAt: '', updatedAt: ''};
const authFailure = vi.fn();
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), {target: {value}});
const click = (name: string) => fireEvent.click(screen.getByRole('button', {name}));
beforeEach(() => {
    vi.resetAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.mocked(api.listAdminRequests).mockResolvedValue([existing]);
    vi.mocked(api.listAudioSources).mockResolvedValue([{shareKey: 'audio-1', filename: 'rain.wav', title: 'Rain', webpageUrl: 'https://example.test/rain', unavailableAt: null, removalRequestedAt: null}]);
    vi.mocked(api.createAdminRequest).mockImplementation(async draft => ({...existing, ...draft, id: 8}));
    vi.mocked(api.sendTargetedMessage).mockResolvedValue({id: 12});
});
afterEach(cleanup);

it('creates requests with tags and an initial status', async () => {
    render(<AdminRequests onAuthFailure={authFailure} />);
    await screen.findByText('Quiet rain');
    click('New request'); change('Title', 'Night train'); change('Source URL', 'https://example.test/train'); change('Source key (optional)', 'train-source'); change('Initial status', 'downloading');
    click('Add tag'); change('Tag 1 name', 'Train'); change('Tag 1 color', '#123456');
    click('Create request');
    await screen.findByText('Edit request #8');
    expect(api.createAdminRequest).toHaveBeenCalledWith({title: 'Night train', submittedUrl: 'https://example.test/train', sourceKey: 'train-source', status: 'downloading', tags: [{name: 'Train', color: '#123456'}]}, expect.any(AbortSignal));
    click('Back to requests');
    expect(screen.getByText('Night train')).toBeTruthy();
});

it('saves details and status separately, clears folder associations, and confirms deletion', async () => {
    render(<AdminRequests onAuthFailure={authFailure} />);
    fireEvent.click(await screen.findByRole('button', {name: 'Edit Quiet rain'}));
    change('Title', 'Rain at night'); change('Tag 1 color', '#abcdef'); click('Save details');
    await screen.findByText('Request details saved.');
    expect(api.editAdminRequest).toHaveBeenCalledWith(7, {title: 'Rain at night', tags: [{name: 'ASMR', color: '#abcdef'}]}, expect.any(AbortSignal));
    expect(api.changeRequestStatus).not.toHaveBeenCalled();
    change('Status', 'added'); change('Folder share key (optional)', ''); click('Save status');
    await screen.findByText('Request status saved.');
    expect(api.changeRequestStatus).toHaveBeenCalledWith(7, {status: 'added', folderShareKey: null}, expect.any(AbortSignal));
    click('Delete request');
    expect(api.deleteAdminRequest).not.toHaveBeenCalled();
    click('Cancel deletion'); click('Delete request'); click('Confirm delete');
    await screen.findByText('Request deleted.');
    expect(api.deleteAdminRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Rain at night')).toBeNull();
});

it('preserves request edits and displays server errors on failure', async () => {
    vi.mocked(api.editAdminRequest).mockRejectedValue(new Error('Request not found'));
    render(<AdminRequests onAuthFailure={authFailure} />);
    fireEvent.click(await screen.findByRole('button', {name: 'Edit Quiet rain'}));
    change('Title', 'Unsaved title'); click('Save details');
    await screen.findByText('Request not found');
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Unsaved title');
});

it('filters and paginates request lists', async () => {
    vi.mocked(api.listAdminRequests).mockResolvedValue(Array.from({length: 26}, (_, i) => ({...existing, id: i, title: `Track ${i}`, status: i === 25 ? 'rejected' : 'requested'})));
    render(<AdminRequests onAuthFailure={authFailure} />);
    await screen.findByText('Page 1 of 2 · 26 results');
    expect(screen.queryByText('Track 25')).toBeNull(); click('Next');
    expect(screen.getByText('Track 25')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', {name: 'Source requests'})); change('Filter status', 'rejected');
    expect(screen.getByText('Page 1 of 1 · 1 results')).toBeTruthy(); change('Search requests', 'not found');
    expect(screen.getByText('No requests match these filters.')).toBeTruthy();
});

it('only changes audio flags after success and confirms a removal request', async () => {
    render(<AdminAudio onAuthFailure={authFailure} />);
    await screen.findByText('Rain'); click('Mark source unavailable');
    await screen.findByRole('button', {name: 'Clear unavailable flag'});
    expect(api.setAudioUnavailable).toHaveBeenCalledWith('audio-1', true, expect.any(AbortSignal));
    click('Clear unavailable flag'); await screen.findByRole('button', {name: 'Mark source unavailable'});
    expect(api.setAudioUnavailable).toHaveBeenLastCalledWith('audio-1', false, expect.any(AbortSignal));
    click('Mark removal requested'); expect(api.setAudioRemovalRequested).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Cancel'}));
    click('Cancel');
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Mark removal requested'}));
    click('Mark removal requested');
    click('Confirm removal request'); await screen.findByRole('button', {name: 'Clear removal request'});
    expect(api.setAudioRemovalRequested).toHaveBeenCalledWith('audio-1', true, expect.any(AbortSignal));
    vi.mocked(api.setAudioRemovalRequested).mockRejectedValueOnce(new Error('Could not save'));
    click('Clear removal request'); await screen.findByText('Could not save');
    expect(screen.getByRole('button', {name: 'Clear removal request'})).toBeTruthy();
});

it('reports expired credentials to the admin shell', async () => {
    vi.mocked(api.listAudioSources).mockRejectedValue(new AdminAccessError('Session expired'));
    render(<AdminAudio onAuthFailure={authFailure} />);
    await waitFor(() => expect(authFailure).toHaveBeenCalledWith('Session expired'));
});

it('queues a message only once while pending and clears the form on success', async () => {
    let finish!: (value: {id: number}) => void;
    vi.mocked(api.sendTargetedMessage).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AdminMessages onAuthFailure={authFailure} />);
    change('Session ID', ' visitor-id '); change('Message title (optional)', ' Hello '); change('Message', ' A note '); click('Send message');
    expect(api.sendTargetedMessage).toHaveBeenCalledWith({sessionId: 'visitor-id', title: 'Hello', message: 'A note'}, expect.any(AbortSignal));
    fireEvent.submit(screen.getByLabelText('Message').closest('form')!);
    expect(api.sendTargetedMessage).toHaveBeenCalledTimes(1);
    await act(async () => finish({id: 12}));
    expect(screen.getByText(/Message #12 queued/)).toBeTruthy();
    expect((screen.getByLabelText('Session ID') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
});

it('retains a message draft on conflict and cancels requests when leaving', async () => {
    vi.mocked(api.sendTargetedMessage).mockRejectedValueOnce(new Error('A pending message already exists for this session'));
    const view = render(<AdminMessages onAuthFailure={authFailure} />);
    change('Session ID', 'visitor-id'); change('Message', 'Keep this draft'); click('Send message');
    await screen.findByText('A pending message already exists for this session');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Keep this draft');
    vi.mocked(api.sendTargetedMessage).mockImplementation(() => new Promise(() => {}));
    click('Send message');
    const signal = vi.mocked(api.sendTargetedMessage).mock.calls[1][1];
    view.unmount(); expect(signal.aborted).toBe(true);
});

it('clears removal confirmation when filtering the selected track out', async () => {
    vi.mocked(api.listAudioSources).mockResolvedValue([
        {shareKey: 'rain', filename: 'rain.wav', title: 'Rain', webpageUrl: 'https://example.test/rain', unavailableAt: null, removalRequestedAt: null},
        {shareKey: 'ocean', filename: 'ocean.wav', title: 'Ocean', webpageUrl: 'https://example.test/ocean', unavailableAt: null, removalRequestedAt: null},
    ]);
    render(<AdminAudio onAuthFailure={authFailure} />);
    await screen.findByText('Ocean');
    fireEvent.click(screen.getAllByRole('button', {name: 'Mark removal requested'})[0]);
    change('Search audio', 'Ocean');
    expect(screen.queryByRole('button', {name: 'Confirm removal request'})).toBeNull();
    expect((screen.getByRole('button', {name: 'Mark removal requested'}) as HTMLButtonElement).disabled).toBe(false);
    click('Mark source unavailable');
    await waitFor(() => expect(api.setAudioUnavailable).toHaveBeenCalledWith('ocean', true, expect.any(AbortSignal)));
});
