import { Component, type ReactNode } from 'react';
import { errorText } from '@shared/errors/errorText';
import { Notice } from './blocks/Notice';

type WindowErrorBoundaryProps = { children: ReactNode; onReload: () => void };

type WindowErrorBoundaryState = { crashed: false } | { crashed: true; error: unknown };

export class WindowErrorBoundary extends Component<WindowErrorBoundaryProps, WindowErrorBoundaryState> {
  state: WindowErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(error: unknown): WindowErrorBoundaryState {
    return { crashed: true, error };
  }

  render() {
    if (!this.state.crashed) {
      return this.props.children;
    }
    return (
      <Notice tone="danger">
        <span>{`Maple crashed: ${errorText(this.state.error)}`}</span>
        <button type="button" onClick={this.props.onReload}>
          Reload window
        </button>
      </Notice>
    );
  }
}
