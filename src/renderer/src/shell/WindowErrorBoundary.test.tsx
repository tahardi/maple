import { fireEvent, render, screen } from '@testing-library/react';
import { WindowErrorBoundary } from './WindowErrorBoundary';

function Thrower({ when }: { when: boolean }) {
  if (when) {
    throw new Error('rendering tab bar: boom');
  }
  return <p>window body</p>;
}

describe('WindowErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows its children when nothing throws', () => {
    // given
    // when
    render(
      <WindowErrorBoundary onReload={vi.fn()}>
        <Thrower when={false} />
      </WindowErrorBoundary>,
    );
    // then
    expect(screen.getByText('window body')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows the error and a Reload window button when a child throws', () => {
    // given
    // when
    render(
      <WindowErrorBoundary onReload={vi.fn()}>
        <Thrower when />
      </WindowErrorBoundary>,
    );
    // then
    expect(screen.getByRole('alert')).toHaveTextContent('Maple crashed: rendering tab bar: boom');
    expect(screen.getByRole('button', { name: 'Reload window' })).toBeInTheDocument();
  });

  test('Reload window calls onReload', () => {
    // given
    const onReload = vi.fn();
    render(
      <WindowErrorBoundary onReload={onReload}>
        <Thrower when />
      </WindowErrorBoundary>,
    );
    // when
    fireEvent.click(screen.getByRole('button', { name: 'Reload window' }));
    // then
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
