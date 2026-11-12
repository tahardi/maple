import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { ReportLauncher } from './ReportLauncher';

function setup() {
  let requested: () => void = () => undefined;
  fakeMaple({
    app: {
      onReportRequested: (cb) => {
        requested = cb;
        return () => undefined;
      },
    },
  });
  render(<ReportLauncher />);
  const request = () => {
    act(() => {
      requested();
    });
  };
  return { request };
}

describe('ReportLauncher', () => {
  test('shows nothing until Help asks for a report', () => {
    // given
    setup();
    // when
    const dialog = screen.queryByRole('dialog');
    // then
    expect(dialog).not.toBeInTheDocument();
  });

  test('a report request opens the report form', () => {
    // given
    const { request } = setup();
    // when
    request();
    // then
    expect(screen.getByRole('dialog', { name: 'Report a bug or feature' })).toBeInTheDocument();
  });

  test.each([
    { name: 'Cancel', close: () => userEvent.click(screen.getByRole('button', { name: 'Cancel' })) },
    { name: 'Escape', close: () => userEvent.keyboard('{Escape}') },
  ])('closing the form with $name hides it', async ({ close }) => {
    // given
    const { request } = setup();
    request();
    // when
    await close();
    // then
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('unmounting stops listening', () => {
    // given
    const stop = vi.fn();
    fakeMaple({ app: { onReportRequested: () => stop } });
    const { unmount } = render(<ReportLauncher />);
    // when
    unmount();
    // then
    expect(stop).toHaveBeenCalledOnce();
  });
});
