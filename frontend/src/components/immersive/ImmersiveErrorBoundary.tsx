import {Component, type ErrorInfo, type ReactNode} from 'react';
import {reportError} from '@/lib/errorReporting';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError: () => void;
}

export default class ImmersiveErrorBoundary extends Component<Props, {failed: boolean}> {
    state = {failed: false};

    static getDerivedStateFromError() {
        return {failed: true};
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        reportError({operation: 'page', stage: 'render', cause: 'unexpected', outcome: 'degraded',
            context: {componentStack: info.componentStack ?? ''}}, error);
        this.props.onError();
    }

    render() {
        return this.state.failed ? this.props.fallback ?? null : this.props.children;
    }
}
