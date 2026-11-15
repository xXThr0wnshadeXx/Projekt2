import { Component, useEffect, useRef, type ReactNode } from 'react';
import { announce } from './LiveRegion';

const RECOVERY = 'Something went wrong on this screen. Your work is saved.';

const ERROR_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'EvalError', 'URIError', 'AggregateError', 'AbortError', 'NotSupportedError',
]);

interface Props {
  screen: string;
  children: ReactNode;
  onBackToStart: () => void;
  onFailure?: (failed: boolean) => void;
}

function Recovery({ onRestart, onBack }: { onRestart: () => void; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const timer = window.setTimeout(() => announce(RECOVERY, 'assertive'), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Screen unavailable</h2>
      <p className="mt-3">{RECOVERY}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={onRestart}>Start this screen again</button>
        <button type="button" className="btn" onClick={onBack}>Back to the start</button>
      </div>
    </main>
  );
}

function DevScreenCrash(): never {
  throw new TypeError('Synthetic screen failure');
}

export class ScreenBoundary extends Component<Props, { failed: boolean; restarted: boolean }> {
  state = { failed: false, restarted: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const name = error instanceof Error ? error.name : '';
    console.error(ERROR_NAMES.has(name) ? name : 'Error', this.props.screen);
    this.props.onFailure?.(true);
  }

  private restart = () => {
    this.props.onFailure?.(false);
    this.setState({ failed: false, restarted: true });
  };

  render() {
    if (this.state.failed) {
      return (
        <Recovery onRestart={this.restart} onBack={() => {
          this.restart();
          this.props.onBackToStart();
        }} />
      );
    }
    if (import.meta.env.DEV && !this.state.restarted
      && new URLSearchParams(window.location.search).get('crash') === this.props.screen) {
      return <DevScreenCrash />;
    }
    return this.props.children;
  }
}
