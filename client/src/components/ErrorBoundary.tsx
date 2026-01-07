import { Component, ReactNode } from 'react';
import { ErrorHandler } from '@/lib/errorHandler';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: any) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const { onError } = this.props;
    
    // Log to error handler
    ErrorHandler.logError(
      'rendering',
      `React error boundary caught: ${error.message}`,
      { errorInfo },
      { component: errorInfo.componentStack }
    );

    this.setState({ errorInfo });

    if (onError) {
      onError(error, errorInfo);
    }
  }

  render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      return (
        fallback || (
          <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
            <h1 className="text-3xl font-bold mb-4">Something went wrong</h1>
            <p className="text-gray-400 mb-4">{error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
            >
              Reload Page
            </button>
            <details className="mt-8 max-w-2xl text-sm text-gray-500">
              <summary className="cursor-pointer">Error Details</summary>
              <pre className="mt-4 p-4 bg-slate-800 rounded overflow-auto">
                {error?.stack}
              </pre>
            </details>
          </div>
        )
      );
    }

    return children;
  }
}
