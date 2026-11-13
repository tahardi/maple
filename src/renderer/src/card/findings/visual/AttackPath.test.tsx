import { render, screen } from '@testing-library/react';
import { AttackPath } from './AttackPath';

describe('AttackPath', () => {
  test('shows each step in order with its actor', () => {
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
  });
});
