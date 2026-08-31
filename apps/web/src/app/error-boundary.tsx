import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled Verilio UI error", error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="mx-auto max-w-xl px-6 py-16">
          <p className="text-sm font-semibold text-[var(--color-danger-default)]">
            Verilio could not render this screen.
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            Reload the page to try again. Your persisted data has not been changed.
          </p>
        </main>
      );
    }

    return this.props.children;
  }
}
