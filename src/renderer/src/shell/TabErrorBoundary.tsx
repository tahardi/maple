import { Component, type ReactNode } from 'react';
import { errorText } from '@shared/errors/errorText';
import { Banner } from './Banner';

type TabErrorBoundaryProps = { children: ReactNode };

type TabErrorBoundaryState = { crashed: false } | { crashed: true; error: unknown };

export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(error: unknown): TabErrorBoundaryState {
    return { crashed: true, error };
  }

  render() {
    if (!this.state.crashed) {
      return this.props.children;
    }
    return (
      <>
        <Banner messages={[`This tab crashed: ${errorText(this.state.error)}`]} />
        <button
          type="button"
          onClick={() => {
            this.setState({ crashed: false });
          }}
        >
          Reload tab
        </button>
      </>
    );
  }
}
