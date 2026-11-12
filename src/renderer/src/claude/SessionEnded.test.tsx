import { act, render, screen } from '@testing-library/react';
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
    render(<SessionEnded tabId="t1" exitCode={exitCode} resumeFailed={false} />);
    // then
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('a failed resume shows "Resume failed (exit code 1)"', () => {
    // given
    fakeMaple();
    // when
    render(<SessionEnded tabId="t1" exitCode={1} resumeFailed />);
    // then
    expect(screen.getByText('Resume failed (exit code 1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start fresh' })).toBeInTheDocument();
  });

  test.each([
    { button: 'Resume', called: 'resume' },
    { button: 'Start fresh', called: 'startFresh' },
  ] as const)('$button calls tabs.$called with the tab id', async ({ button, called }) => {
    // given
    const calls = { resume: vi.fn(() => Promise.resolve()), startFresh: vi.fn(() => Promise.resolve()) };
    fakeMaple({ tabs: calls });
    render(<SessionEnded tabId="t1" exitCode={0} resumeFailed={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: button }));
    // then
    expect(calls[called]).toHaveBeenCalledWith('t1');
    expect(calls[called === 'resume' ? 'startFresh' : 'resume']).not.toHaveBeenCalled();
  });

  test('Resume is the primary button', () => {
    // given
    fakeMaple();
    // when
    render(<SessionEnded tabId="t1" exitCode={0} resumeFailed={false} />);
    // then
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveAttribute('data-variant', 'primary');
    expect(screen.getByRole('button', { name: 'Start fresh' })).not.toHaveAttribute('data-variant');
  });

  test.each([
    { label: 'Resume', busyLabel: 'Resuming…', other: 'Start fresh', settle: 'resume' },
    { label: 'Start fresh', busyLabel: 'Starting…', other: 'Resume', settle: 'startFresh' },
  ] as const)('$label reads $busyLabel and disables both buttons until it settles', async (row) => {
    // given
    let finish: () => void = () => undefined;
    const pending = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fakeMaple({ tabs: { resume: pending, startFresh: pending } });
    render(<SessionEnded tabId="t1" exitCode={0} resumeFailed={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: row.label }));
    // then
    expect(screen.getByRole('button', { name: row.busyLabel })).toBeDisabled();
    expect(screen.getByRole('button', { name: row.other })).toBeDisabled();
    // when
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    // then
    expect(screen.getByRole('button', { name: row.label })).toBeEnabled();
    expect(screen.getByRole('button', { name: row.other })).toBeEnabled();
  });
});
