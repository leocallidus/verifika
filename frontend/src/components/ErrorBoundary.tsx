import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

function errToMessage(e: unknown): string {
  if (e == null) return "Неизвестная ошибка";
  if (e instanceof Error) return e.message || String(e);
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    const err =
      error instanceof Error
        ? error
        : new Error(errToMessage(error));
    return { error: err };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private onReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="min-h-[100vh] grid place-items-center p-6 bg-[var(--color-bg)] text-[var(--color-text-primary)]"
          style={{ minHeight: "100svh" }}
        >
          <div className="max-w-[480px] w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl shadow-sm p-6 text-center">
            <h1 className="text-lg font-semibold mb-2">Что-то пошло не так</h1>
            <p className="text-sm text-[var(--color-text-muted)] mb-4 break-words">
              {errToMessage(this.state.error)}
            </p>
            <button
              type="button"
              onClick={this.onReset}
              className="btn btn-primary"
            >
              Попробовать ещё раз
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
