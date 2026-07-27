export const contactTopicOptions = [
    { value: 'general', label: 'General Question' },
    { value: 'bug', label: 'Bug Report' },
    { value: 'feature', label: 'Feature Request' },
    { value: 'content', label: 'Content Issue' },
    { value: 'abuse', label: 'Abuse' },
    { value: 'other', label: 'Other' },
];

export function contactTopicFromSearch(search: string) {
    const requestedTopic = new URLSearchParams(search).get('topic');
    return contactTopicOptions.some(({ value }) => value === requestedTopic) ? requestedTopic! : '';
}
