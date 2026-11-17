import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteMenu } from './NoteMenu';

function renderMenu(unsaved = false) {
  const props = {
    x: 40,
    y: 60,
    unsaved,
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onCopyPath: vi.fn(),
    onOpenInObsidian: vi.fn(),
    onTrash: vi.fn(),
    onDismiss: vi.fn(),
  };
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
    expect(within(item).getByText('Save or discard your edits first')).toBeVisible();
    expect(props.onTrash).not.toHaveBeenCalled();
  });

  test.each([
    { item: 'Rename', handler: 'onRename' },
    { item: 'Duplicate', handler: 'onDuplicate' },
    { item: 'Copy path', handler: 'onCopyPath' },
    { item: 'Open in Obsidian', handler: 'onOpenInObsidian' },
  ] as const)('$item calls $handler', async ({ item, handler }) => {
    // given
    const props = renderMenu();
    // when
    await userEvent.click(screen.getByRole('menuitem', { name: item }));
    // then
    expect(props[handler]).toHaveBeenCalledTimes(1);
  });

  test('Rename is disabled with its reason when the note has unsaved edits', async () => {
    // given
    const props = renderMenu(true);
    const item = screen.getByRole('menuitem', { name: /Rename/ });
    // when
    await userEvent.click(item);
    // then
    expect(item).toBeDisabled();
    expect(within(item).getByText('Save or discard your edits first')).toBeVisible();
    expect(props.onRename).not.toHaveBeenCalled();
  });

  test.each([
    { item: 'Rename', key: 'F2' },
    { item: 'Move to trash', key: 'Del' },
  ])('$item shows its $key key', ({ item, key }) => {
    // given
    renderMenu();
    // when
    const shown = screen.getByRole('menuitem', { name: item });
    // then
    expect(within(shown).getByText(key)).toBeVisible();
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
