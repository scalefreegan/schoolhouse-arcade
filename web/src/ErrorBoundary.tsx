import { Component, type ReactNode } from "react";

/** Contains a crash to the piece that crashed: one game failing must not
 *  take the arcade down with it. Shows what broke so it can be reported. */
export class ErrorBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`[schoolhouse-arcade] ${this.props.label} crashed:`, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-crash={this.props.label} className="panel panel-bad mx-auto my-8 max-w-xl">
        <p className="font-display text-sm text-bad">Game over, sort of.</p>
        <p className="mt-3">{this.props.label} hit an error. Reload the page to try again.</p>
        <p className="mt-2 text-dim">{this.state.error.message}</p>
      </div>
    );
  }
}
