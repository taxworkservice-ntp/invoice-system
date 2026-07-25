import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center gap-3 p-4">
          <div className="text-sm font-semibold text-[#1A1A18]">เกิดข้อผิดพลาด</div>
          <p className="text-xs text-gray-500 text-center max-w-xs">
            กรุณารีเฟรชหน้าใหม่ หรือลองใหม่อีกครั้ง
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="mt-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:opacity-90"
          >
            รีเฟรช
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
