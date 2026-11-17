import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptRiskDialog } from './AcceptRiskDialog';

describe('AcceptRiskDialog', () => {
  test('confirm stays disabled until a reason is typed', async () => {
    // given
    const onConfirm = vi.fn();
    render(<AcceptRiskDialog initialReason="" busy={false} error={null} onConfirm={onConfirm} onClose={vi.fn()} />);
    const confirm = screen.getByRole('button', { name: 'Accept risk' });
    expect(confirm).toBeDisabled();
    expect(screen.getByText('Type a reason')).toBeInTheDocument();
    // when
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), 'Local only');
    await userEvent.click(confirm);
    // then
    expect(onConfirm).toHaveBeenCalledWith('Local only');
  });

  test('a blank reason keeps confirm disabled', async () => {
    // given
    render(<AcceptRiskDialog initialReason="" busy={false} error={null} onConfirm={vi.fn()} onClose={vi.fn()} />);
    // when
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), '   ');
    // then
    expect(screen.getByRole('button', { name: 'Accept risk' })).toBeDisabled();
  });

  test('limits the reason to 500 characters', () => {
    // given
    // when
    render(<AcceptRiskDialog initialReason="" busy={false} error={null} onConfirm={vi.fn()} onClose={vi.fn()} />);
    // then
    expect(screen.getByRole('textbox', { name: 'Reason' })).toHaveAttribute('maxlength', '500');
  });

  test('cancel closes without confirming', async () => {
    // given
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<AcceptRiskDialog initialReason="" busy={false} error={null} onConfirm={onConfirm} onClose={onClose} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // then
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('shows the error inside the dialog', () => {
    // given
    // when
    render(
      <AcceptRiskDialog
        initialReason=""
        busy={false}
        error="saving findings: EACCES"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // then
    expect(screen.getByRole('alert')).toHaveTextContent('saving findings: EACCES');
  });

  test('busy shows Saving… on the confirm button', async () => {
    // given
    const { rerender } = render(
      <AcceptRiskDialog initialReason="" busy={false} error={null} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), 'Local only');
    // when
    rerender(<AcceptRiskDialog initialReason="" busy error={null} onConfirm={vi.fn()} onClose={vi.fn()} />);
    // then
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true');
  });

  test('starts with the initial reason, which can be confirmed as is', async () => {
    // given
    const onConfirm = vi.fn();
    render(
      <AcceptRiskDialog
        initialReason="Only Taylor can reach it."
        busy={false}
        error={null}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Accept risk' });
    expect(screen.getByRole('textbox', { name: 'Reason' })).toHaveValue('Only Taylor can reach it.');
    expect(confirm).toBeEnabled();
    // when
    await userEvent.click(confirm);
    // then
    expect(onConfirm).toHaveBeenCalledWith('Only Taylor can reach it.');
  });

  test('an edited initial reason confirms the edited text', async () => {
    // given
    const onConfirm = vi.fn();
    render(
      <AcceptRiskDialog
        initialReason="Only Taylor can reach it."
        busy={false}
        error={null}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const textbox = screen.getByRole('textbox', { name: 'Reason' });
    // when
    await userEvent.clear(textbox);
    await userEvent.type(textbox, 'Local only');
    await userEvent.click(screen.getByRole('button', { name: 'Accept risk' }));
    // then
    expect(onConfirm).toHaveBeenCalledWith('Local only');
  });
});
