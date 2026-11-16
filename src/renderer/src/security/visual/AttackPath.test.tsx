import { render, screen } from '@testing-library/react';
import { AttackPath } from './AttackPath';

function follows(later: Element, earlier: Element): boolean {
  return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const crosses = 'Maple trusts the rewritten file';

describe('AttackPath', () => {
  test('groups steps by zone with less and more trusted labels', () => {
    // given
    const steps = [
      { actor: 'a session', step: 'Rewrites the findings file.', zone: 'Claude sessions' },
      { actor: 'a session', step: 'Adds a fake decision.', zone: 'Claude sessions' },
      { actor: 'Maple', step: 'Shows the fake decision.', zone: 'Maple app', crosses },
    ];
    // when
    render(<AttackPath steps={steps} />);
    // then
    const less = screen.getByRole('region', { name: 'Less trusted · Claude sessions' });
    const more = screen.getByRole('region', { name: 'More trusted · Maple app' });
    expect(less).toHaveTextContent('Rewrites the findings file.');
    expect(less).toHaveTextContent('Adds a fake decision.');
    expect(more).toHaveTextContent('Shows the fake decision.');
    expect(screen.getAllByRole('region')).toHaveLength(2);
  });

  test('labels a single zone with its name alone', () => {
    // given
    const steps = [
      { actor: 'a session', step: 'Rewrites the findings file.', zone: 'Claude sessions' },
      { actor: 'a session', step: 'Adds a fake decision.', zone: 'Claude sessions' },
    ];
    // when
    render(<AttackPath steps={steps} />);
    // then
    const area = screen.getByRole('region', { name: 'Claude sessions' });
    expect(area).toHaveTextContent('Rewrites the findings file.');
    expect(area).toHaveTextContent('Adds a fake decision.');
    expect(area).toHaveTextContent('Claude sessions');
    expect(area).toHaveAttribute('data-trust', 'less');
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.queryByText(/Less trusted/)).not.toBeInTheDocument();
  });

  test('labels the wall with crosses', () => {
    // given
    const steps = [
      { actor: 'a session', step: 'Rewrites the findings file.', zone: 'Claude sessions' },
      { actor: 'Maple', step: 'Shows the fake decision.', zone: 'Maple app', crosses },
    ];
    // when
    render(<AttackPath steps={steps} />);
    // then
    const [less, more] = screen.getAllByRole('region');
    const label = screen.getByText(crosses);
    expect(follows(label, less)).toBe(true);
    expect(follows(more, label)).toBe(true);
    expect(screen.getByRole('separator', { name: crosses })).toContainElement(label);
  });

  test('draws a wall with no label when crosses is missing', () => {
    // given
    const steps = [
      { actor: 'a session', step: 'Rewrites the findings file.', zone: 'Claude sessions' },
      { actor: 'Maple', step: 'Shows the fake decision.', zone: 'Maple app' },
    ];
    // when
    render(<AttackPath steps={steps} />);
    // then
    expect(screen.getByRole('separator').textContent).toBe('→');
  });

  test('draws two walls for three zones', () => {
    // given
    const steps = [
      { actor: 'a stranger', step: 'Opens a pull request.', zone: 'the internet' },
      { actor: 'CI', step: 'Runs the build.', zone: 'GitHub', crosses: 'the branch name' },
      { actor: 'Maple', step: 'Reads the result.', zone: 'Maple app', crosses: 'the check result' },
    ];
    // when
    render(<AttackPath steps={steps} />);
    // then
    expect(screen.getAllByRole('separator').map((wall) => wall.textContent)).toEqual([
      '→the branch name',
      '→the check result',
    ]);
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      'Less trusted · the internet',
      'More trusted · GitHub',
      'More trusted · Maple app',
    ]);
  });

  test('draws steps without zones as one row', () => {
    // given
    const steps = [
      { actor: 'a stranger', step: 'Opens a pull request.' },
      { actor: 'the app', step: 'Runs a shell command.' },
      { actor: 'the shell', step: 'Reads the token.' },
    ];
    // when
    render(<AttackPath steps={steps} />);
    // then
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'a strangerOpens a pull request.',
      'the appRuns a shell command.',
      'the shellReads the token.',
    ]);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  test('draws a path with some steps missing a zone as one row', () => {
    // given
    const steps = [
      { actor: 'a stranger', step: 'Opens a pull request.', zone: 'the internet' },
      { actor: 'the app', step: 'Runs a shell command.' },
    ];
    // when
    render(<AttackPath steps={steps} />);
    // then
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});
