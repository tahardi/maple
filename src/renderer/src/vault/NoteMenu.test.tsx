import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteMenu } from './NoteMenu';

function renderMenu(unsaved = false) {
  const props = { x: 40, y: 60, unsaved, onTrash: vi.fn(), onDismiss: vi.fn() };
  render(<NoteMenu {...props} />);
  return props;
}

describe('NoteMenu', () => {
  test('Move to trash calls onTrash', async () => {
    // given
    const props = renderMenu();
    // when
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }));
    // then
    expect(props.onTrash).toHaveBeenCalledTimes(1);
  });

  test('Move to trash is disabled with its reason when the note has unsaved edits', async () => {
    // given
    const props = renderMenu(true);
    const item = screen.getByRole('menuitem', { name: /Move to trash/ });
    // when
    await userEvent.click(item);
    // then
    expect(item).toBeDisabled();
    expect(screen.getByText('Save or discard your edits first')).toBeVisible();
    expect(props.onTrash).not.toHaveBeenCalled();
  });

  test('Escape dismisses the menu', () => {
    // given
    const props = renderMenu();
    // when
    fireEvent.keyDown(document, { key: 'Escape' });
    // then
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });
});
