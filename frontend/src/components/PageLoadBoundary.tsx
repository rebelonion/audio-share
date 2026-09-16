import {Component, type ReactNode} from 'react';

// Keep route failures inside the page so the surrounding player stays mounted.
export default class PageLoadBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
    state = {failed: false};

    static getDerivedStateFromError() {
        return {failed: true};
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div role="alert" className="space-y-3 py-8">
                <p>This page could not be loaded. You can keep listening and refresh when you’re ready.</p>
                <button
                    type="button"
                    className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-white"
                    onClick={() => window.location.reload()}
                >
                    Refresh page
                </button>
            </div>
        );
    }
}
