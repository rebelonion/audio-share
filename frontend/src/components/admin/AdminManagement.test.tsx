/** @vitest-environment jsdom */
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import AdminRequests from './AdminRequests';
import AdminAudio from './AdminAudio';
import AdminMessages from './AdminMessages';
import AdminBanner from './AdminBanner';
import * as api from '@/lib/adminManagement';
import {AdminAccessError} from '@/lib/operations';
import type {SourceRequest} from '@/types';

vi.mock('@/lib/adminManagement');
const existing: SourceRequest = {id: 7, title: 'Quiet rain', submittedUrl: 'https://example.test/rain', status: 'requested', tags: [{name: 'ASMR', color: '#c4882a'}], folderShareKey: 'folder-1', createdAt: '', updatedAt: ''};
const pendingMessage: api.PendingTargetedMessage = {id: 12, sessionId: 'visitor-id', title: 'Hello', message: 'A note', createdAt: '2026-10-29T12:00:00Z'};
const authFailure = vi.fn();
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), {target: {value}});
const click = (name: string) => fireEvent.click(screen.getByRole('button', {name}));
const select = (label: string, option: string) => {
    click(label);
    fireEvent.click(screen.getByRole('option', {name: option}));
};
beforeEach(() => {
    vi.resetAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.mocked(api.listAdminRequests).mockResolvedValue([existing]);
    vi.mocked(api.listAudioSources).mockResolvedValue([{shareKey: 'audio-1', filename: 'rain.wav', title: 'Rain', webpageUrl: 'https://example.test/rain', unavailableAt: null, removalRequestedAt: null}]);
    vi.mocked(api.createAdminRequest).mockImplementation(async draft => ({...existing, ...draft, id: 8}));
    vi.mocked(api.sendTargetedMessage).mockResolvedValue(pendingMessage);
    vi.mocked(api.listTargetedMessages).mockResolvedValue([]);
});
afterEach(cleanup);

it('creates requests with tags and an initial status', async () => {
    render(<AdminRequests onAuthFailure={authFailure} />);
    await screen.findByText('Quiet rain');
    click('New request'); change('Title', 'Night train'); change('Source URL', 'https://example.test/train'); change('Source key (optional)', 'train-source'); select('Initial status', 'Downloading');
    click('Add tag'); change('Tag 1 name', 'Train'); change('Tag 1 color', '#123456');
    click('Create request');
    await screen.findByText('Edit request #8');
    expect(api.createAdminRequest).toHaveBeenCalledWith({title: 'Night train', submittedUrl: 'https://example.test/train', sourceKey: 'train-source', status: 'downloading', tags: [{name: 'Train', color: '#123456'}]}, expect.any(AbortSignal));
    click('Back to requests');
    expect(screen.getByText('Night train')).toBeTruthy();
});

it('saves details and status separately and confirms deletion', async () => {
    render(<AdminRequests onAuthFailure={authFailure} />);
    fireEvent.click(await screen.findByRole('button', {name: 'Edit Quiet rain'}));
    change('Title', 'Rain at night'); change('Tag 1 color', '#abcdef'); click('Save details');
    await screen.findByText('Request details saved.');
    expect(api.editAdminRequest).toHaveBeenCalledWith(7, {title: 'Rain at night', tags: [{name: 'ASMR', color: '#abcdef'}]}, expect.any(AbortSignal));
    expect(api.changeRequestStatus).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Folder share key (optional)')).toBeNull();
    select('Status', 'Added'); click('Save status');
    await screen.findByText('Request status saved.');
    expect(api.changeRequestStatus).toHaveBeenCalledWith(7, {status: 'added'}, expect.any(AbortSignal));
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
    expect(document.activeElement).toBe(screen.getByRole('heading', {name: 'Source requests'})); select('Filter status', 'Rejected');
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
    let finish!: (value: api.PendingTargetedMessage) => void;
    vi.mocked(api.sendTargetedMessage).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AdminMessages onAuthFailure={authFailure} />);
    change('Session ID', ' visitor-id '); change('Message title (optional)', ' Hello '); change('Message', ' A note '); click('Send message');
    expect(api.sendTargetedMessage).toHaveBeenCalledWith({sessionId: 'visitor-id', title: 'Hello', message: 'A note'}, expect.any(AbortSignal));
    fireEvent.submit(screen.getByLabelText('Message').closest('form')!);
    expect(api.sendTargetedMessage).toHaveBeenCalledTimes(1);
    await act(async () => finish(pendingMessage));
    expect(screen.getByText(/Message #12 queued/)).toBeTruthy();
    expect((screen.getByLabelText('Session ID') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByText(/#12 · /)).toBeTruthy();
});

it('lists pending messages and deletes one after confirmation', async () => {
    vi.mocked(api.listTargetedMessages).mockResolvedValue([pendingMessage, {...pendingMessage, id: 13, sessionId: 'other-id', message: 'Second note'}]);
    vi.mocked(api.deleteTargetedMessage).mockResolvedValue(true);
    render(<AdminMessages onAuthFailure={authFailure} />);
    await screen.findByText('Second note');
    fireEvent.click(screen.getAllByRole('button', {name: 'Delete message'})[0]);
    click('Cancel');
    expect(api.deleteTargetedMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', {name: 'Delete message'})[0]);
    click('Confirm delete');
    await screen.findByText(/Message #12 deleted/);
    expect(api.deleteTargetedMessage).toHaveBeenCalledWith(12, expect.any(AbortSignal));
    expect(screen.queryByText('A note')).toBeNull();
    expect(screen.getByText('Second note')).toBeTruthy();
});

it('keeps a pending message listed when deletion fails', async () => {
    vi.mocked(api.listTargetedMessages).mockResolvedValue([pendingMessage]);
    vi.mocked(api.deleteTargetedMessage).mockRejectedValue(new Error('Could not confirm the change. Check the current state before retrying.'));
    render(<AdminMessages onAuthFailure={authFailure} />);
    await screen.findByText('A note');
    click('Delete message'); click('Confirm delete');
    await screen.findByText(/Could not confirm the change/);
    expect(screen.getByText('A note')).toBeTruthy();
});

it('drops a message the visitor already dismissed and closes the confirmation', async () => {
    vi.mocked(api.listTargetedMessages).mockResolvedValue([pendingMessage]);
    vi.mocked(api.deleteTargetedMessage).mockResolvedValue(false);
    render(<AdminMessages onAuthFailure={authFailure} />);
    await screen.findByText('A note');
    click('Delete message'); click('Confirm delete');
    await screen.findByText(/Message #12 was already gone/);
    expect(screen.queryByText('A note')).toBeNull();
    expect(screen.queryByRole('button', {name: 'Confirm delete'})).toBeNull();
});

it('keeps a message sent while the pending list is still loading', async () => {
    let finishList!: (value: api.PendingTargetedMessage[]) => void;
    vi.mocked(api.listTargetedMessages).mockImplementation(() => new Promise(resolve => { finishList = resolve; }));
    render(<AdminMessages onAuthFailure={authFailure} />);
    change('Session ID', 'visitor-id'); change('Message', 'A note'); click('Send message');
    await screen.findByText(/Message #12 queued/);
    await act(async () => finishList([{...pendingMessage, id: 13, sessionId: 'other-id', message: 'Older note'}]));
    expect(screen.getByText('A note')).toBeTruthy();
    expect(screen.getByText('Older note')).toBeTruthy();
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

it('shows, updates, and removes the site banner with a preview', async () => {
    vi.mocked(api.getSiteBanner).mockResolvedValue({banner: null});
    vi.mocked(api.saveSiteBanner).mockImplementation(async body => ({banner: {...body, message: body.message.trim()}}));
    vi.mocked(api.clearSiteBanner).mockResolvedValue({banner: null});
    render(<AdminBanner onAuthFailure={authFailure} />);
    await screen.findByText('No banner');
    expect((screen.getByRole('button', {name: 'Show banner'}) as HTMLButtonElement).disabled).toBe(true);
    change('Message', ' Requests are paused. '); select('Banner style', 'Warning'); change('Link text (optional)', 'Details'); change('Link URL (optional)', '/requests');
    const preview = screen.getByRole('region', {name: 'Banner preview'});
    expect(preview.textContent).toContain('Requests are paused.');
    expect(preview.textContent).toContain('Details');
    click('Show banner');
    await screen.findByText(/Banner saved/);
    expect(api.saveSiteBanner).toHaveBeenCalledWith({message: ' Requests are paused. ', variant: 'warning', linkText: 'Details', linkUrl: '/requests'}, expect.any(AbortSignal));
    expect(screen.getByText('Showing')).toBeTruthy();
    expect((screen.getByRole('button', {name: 'Update banner'}) as HTMLButtonElement).disabled).toBe(true);
    click('Remove banner');
    await screen.findByText(/Banner removed/);
    expect(screen.getByText('No banner')).toBeTruthy();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
});

it('shows banner validation errors from the server', async () => {
    vi.mocked(api.getSiteBanner).mockResolvedValue({banner: {message: 'Old', variant: 'info'}});
    vi.mocked(api.saveSiteBanner).mockRejectedValue(new Error('link text and link URL must be set together'));
    render(<AdminBanner onAuthFailure={authFailure} />);
    await screen.findByText('Showing');
    change('Link text (optional)', 'Details');
    click('Update banner');
    await screen.findByText('link text and link URL must be set together');
    expect((screen.getByLabelText('Link text (optional)') as HTMLInputElement).value).toBe('Details');
});

it('offers a retry when the banner fails to load', async () => {
    vi.mocked(api.getSiteBanner).mockRejectedValueOnce(new Error('Could not load data. Try refreshing.')).mockResolvedValueOnce({banner: {message: 'Live', variant: 'info'}});
    render(<AdminBanner onAuthFailure={authFailure} />);
    await screen.findByText('Could not load data. Try refreshing.');
    expect(screen.queryByLabelText('Message')).toBeNull();
    click('Retry');
    await screen.findByText('Showing');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Live');
});

it('counts banner length like the server and labels the pending action', async () => {
    vi.mocked(api.getSiteBanner).mockResolvedValue({banner: {message: 'Live', variant: 'info'}});
    let finishRemove!: () => void;
    vi.mocked(api.clearSiteBanner).mockImplementation(() => new Promise(done => { finishRemove = () => done({banner: null}); }));
    render(<AdminBanner onAuthFailure={authFailure} />);
    await screen.findByText('Showing');
    // 500 emoji are 1,000 UTF-16 units but 500 characters to the server.
    change('Message', '🎧'.repeat(500));
    expect(screen.getByText('500 / 500')).toBeTruthy();
    expect((screen.getByRole('button', {name: 'Update banner'}) as HTMLButtonElement).disabled).toBe(false);
    change('Message', '🎧'.repeat(501));
    expect(screen.getByText('1 character over the 500-character limit')).toBeTruthy();
    expect((screen.getByRole('button', {name: 'Update banner'}) as HTMLButtonElement).disabled).toBe(true);
    click('Remove banner');
    expect(screen.getByRole('button', {name: 'Removing…'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Update banner'})).toBeTruthy();
    await act(async () => finishRemove());
    await screen.findByText(/Banner removed/);
});

it('inserts a time placeholder into the banner message', async () => {
    vi.mocked(api.getSiteBanner).mockResolvedValue({banner: null});
    render(<AdminBanner onAuthFailure={authFailure} />);
    await screen.findByText('No banner');
    change('Message', 'Live in ');
    expect((screen.getByRole('button', {name: 'Insert'}) as HTMLButtonElement).disabled).toBe(true);
    change('Moment', '2026-10-20T18:00'); change('Text once it ends (optional)', 'now');
    click('Insert');
    const iso = new Date('2026-10-20T18:00').toISOString().replace(':00.000Z', 'Z');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(`Live in {countdown:${iso}|now}`);
    expect(screen.getByRole('region', {name: 'Banner preview'}).querySelector('time')).toBeTruthy();
});
