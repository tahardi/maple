import { fireEvent, render, screen } from '@testing-library/react';
import { TabErrorBoundary } from './TabErrorBoundary';

function Thrower({ when }: { when: () => boolean }) {
  if (when()) {
    throw new Error('rendering diff: bad hunk');
  }
  return <p>tab body</p>;
}

describe('TabErrorBoundary', () => {
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
      <TabErrorBoundary>
        <Thrower when={() => false} />
      </TabErrorBoundary>,
    );
    // then
    expect(screen.getByText('tab body')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows the error and a Reload tab button when a child throws', () => {
    // given
    // when
    render(
      <TabErrorBoundary>
        <Thrower when={() => true} />
      </TabErrorBoundary>,
    );
    // then
    expect(screen.getByRole('alert')).toHaveTextContent('This tab crashed: rendering diff: bad hunk');
    expect(screen.getByRole('button', { name: 'Reload tab' })).toBeInTheDocument();
  });

  test('Reload tab remounts the children', () => {
    // given
    let broken = true;
    render(
      <TabErrorBoundary>
        <Thrower when={() => broken} />
      </TabErrorBoundary>,
    );
    broken = false;
    // when
    fireEvent.click(screen.getByRole('button', { name: 'Reload tab' }));
    // then
    expect(screen.getByText('tab body')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
