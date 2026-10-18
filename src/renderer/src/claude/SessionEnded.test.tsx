import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { SessionEnded } from './SessionEnded';

describe('SessionEnded', () => {
  test.each([
    { exitCode: 2, text: 'Session ended (exit code 2)' },
    { exitCode: 0, text: 'Session ended (exit code 0)' },
    { exitCode: null, text: 'Session ended (exit code unknown)' },
  ])('exit code $exitCode shows "$text"', ({ exitCode, text }) => {
    // given
    fakeMaple();
    // when
    render(<SessionEnded tabId="t1" exitCode={exitCode} />);
    // then
    expect(screen.getByText(text)).toBeInTheDocument();
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
