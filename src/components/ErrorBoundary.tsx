import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import ErrorReportButton from './ErrorReportButton';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
}

/**
 * React error boundary scoped to page content inside AppLayout.
 * Sidebar and header stay intact on crash.
 * Provides reload + navigate-to-dashboard recovery.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, componentStack: '' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack || '' });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-100">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-500 mb-6">
              This page encountered an unexpected error. Your data is safe.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 bg-[#1D4ED8] hover:bg-[#1e40af] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              {this.state.error && <ErrorReportButton error={this.state.error} componentStack={this.state.componentStack} />}
            </div>
            {this.state.error && (
              <details className="mt-6 text-left bg-gray-50 rounded-xl p-4 border border-gray-100">
                <summary className="text-xs font-semibold text-gray-500 cursor-pointer">
                  Error details
                </summary>
                <pre className="mt-2 text-xs text-gray-600 overflow-auto whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
