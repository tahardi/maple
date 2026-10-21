import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { ReportDialog } from './ReportDialog';

const LOG_NOTE = /recent log will be attached/i;

function renderDialog() {
  const onClose = vi.fn();
  render(<ReportDialog onClose={onClose} />);
  return { onClose };
}

describe('ReportDialog', () => {
  test('selects Bug by default and says the recent log will be attached', () => {
    // given
    fakeMaple();
    // when
    renderDialog();
    // then
    expect(screen.getByRole('radio', { name: 'Bug' })).toBeChecked();
    expect(screen.getByText(LOG_NOTE)).toBeInTheDocument();
  });

  test('hides the log note for a feature', async () => {
    // given
    fakeMaple();
    renderDialog();
    // when
    await userEvent.click(screen.getByRole('radio', { name: 'Feature' }));
    // then
    expect(screen.queryByText(LOG_NOTE)).not.toBeInTheDocument();
  });

  test.each([
    { name: 'empty', title: '' },
    { name: 'only spaces', title: '   ' },
  ])('disables Submit while the title is $name', async ({ title }) => {
    // given
    fakeMaple();
    renderDialog();
    // when
    if (title !== '') {
      await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), title);
    }
    // then
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  test('files the report and links the new card', async () => {
    // given
    const report = vi.fn(() => Promise.resolve({ key: 'MPL-80', url: 'https://example.atlassian.net/browse/MPL-80' }));
    fakeMaple({ jira: { report } });
    renderDialog();
    await userEvent.click(screen.getByRole('radio', { name: 'Feature' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Dark mode');
    await userEvent.type(screen.getByRole('textbox', { name: 'Description' }), 'Please');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    // then
    expect(report).toHaveBeenCalledWith({ kind: 'feature', title: 'Dark mode', description: 'Please' });
    expect(await screen.findByRole('link', { name: 'Filed MPL-80' })).toHaveAttribute(
      'href',
      'https://example.atlassian.net/browse/MPL-80',
    );
  });

  test('shows the error and keeps what was typed when filing fails', async () => {
    // given
    const report = vi.fn(() => Promise.reject(new Error('filing report: Jira returned 400')));
    fakeMaple({ jira: { report } });
    renderDialog();
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Crash');
    await userEvent.type(screen.getByRole('textbox', { name: 'Description' }), 'On start');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    // then
    expect(await screen.findByRole('alert')).toHaveTextContent('filing report: Jira returned 400');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Crash');
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('On start');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  test.each([
    { name: 'Escape', close: () => userEvent.keyboard('{Escape}') },
    { name: 'Cancel', close: () => userEvent.click(screen.getByRole('button', { name: 'Cancel' })) },
  ])('$name closes it', async ({ close }) => {
    // given
    fakeMaple();
    const { onClose } = renderDialog();
    // when
    await close();
    // then
    expect(onClose).toHaveBeenCalledOnce();
  });
});
