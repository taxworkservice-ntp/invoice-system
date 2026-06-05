import React from "react";

interface PrintErrorBoundaryProps {
  children: React.ReactNode;
  onError: (error: Error) => void;
}

interface PrintErrorBoundaryState {
  hasError: boolean;
}

export class PrintErrorBoundary extends React.Component<PrintErrorBoundaryProps, PrintErrorBoundaryState> {
  state: PrintErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}
