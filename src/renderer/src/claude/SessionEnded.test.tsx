import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { SessionEnded } from './SessionEnded';

describe('SessionEnded', () => {
  test('shows the exit code', () => {
    // given
    fakeMaple();
    // when
    render(<SessionEnded tabId="t1" exitCode={2} />);
    // then
    expect(screen.getByText('Session ended (exit code 2)')).toBeInTheDocument();
  });

  test.each([
    { button: 'Resume', called: 'resume' },
    { button: 'Start fresh', called: 'startFresh' },
  ] as const)('$button calls tabs.$called with the tab id', async ({ button, called }) => {
    // given
    const calls = { resume: vi.fn(() => Promise.resolve()), startFresh: vi.fn(() => Promise.resolve()) };
    fakeMaple({ tabs: calls });
    render(<SessionEnded tabId="t1" exitCode={0} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: button }));
    // then
    expect(calls[called]).toHaveBeenCalledWith('t1');
    expect(calls[called === 'resume' ? 'startFresh' : 'resume']).not.toHaveBeenCalled();
  });
});
