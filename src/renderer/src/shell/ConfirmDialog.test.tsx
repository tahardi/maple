import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Close tab?"
      body="The session is still working."
      confirmLabel="Close"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  test.each([
    { action: 'confirm', button: 'Close', called: 'onConfirm' },
    { action: 'cancel', button: 'Cancel', called: 'onCancel' },
  ] as const)('$action calls $called', async ({ button, called }) => {
    // given
    const handlers = renderDialog();
    // when
    await userEvent.click(screen.getByRole('button', { name: button }));
    // then
    expect(handlers[called]).toHaveBeenCalledOnce();
    expect(handlers[called === 'onConfirm' ? 'onCancel' : 'onConfirm']).not.toHaveBeenCalled();
  });

  test.each([
    { danger: true, variant: 'danger' },
    { danger: false, variant: 'primary' },
    { danger: undefined, variant: 'primary' },
  ])('the confirm button is $variant when danger is $danger', ({ danger, variant }) => {
    // given
    const confirmLabel = 'Confirm';
    // when
    render(
      <ConfirmDialog
        title="t"
        body="b"
        confirmLabel={confirmLabel}
        danger={danger}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // then
    expect(screen.getByRole('button', { name: confirmLabel })).toHaveAttribute('data-variant', variant);
  });

  test('the cancel event (Escape) cancels', () => {
    // given
    const { onConfirm, onCancel } = renderDialog();
    // when
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    // then
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('shows the title and body', () => {
    // given
    renderDialog();
    // then
    expect(screen.getByRole('dialog', { name: 'Close tab?' })).toHaveTextContent('The session is still working.');
  });
});
