import ErrorState from '@/components/ui/ErrorState';
import {Component, type ReactNode, type ErrorInfo} from 'react';
import {reportError} from '@/lib/errorReporting';

// Keep route failures inside the page so the surrounding player stays mounted.
export default class PageLoadBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
    state = {failed: false};

    componentDidCatch(error: Error, info: ErrorInfo) {
        reportError({operation: 'page', stage: 'render', cause: 'unexpected', context: {componentStack: info.componentStack || ''}}, error);
    }

    static getDerivedStateFromError() {
        return {failed: true};
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <ErrorState title="This page could not be loaded" onRetry={() => window.location.reload()} retryLabel="Refresh page">
                You can keep listening and refresh when you’re ready.
            </ErrorState>
        );
    }
}
