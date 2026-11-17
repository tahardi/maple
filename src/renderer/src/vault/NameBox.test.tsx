import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NameBox } from './NameBox';

function renderBox(busy = false) {
  const props = {
    label: 'New note name',
    placeholder: 'Note name in Projects',
    busy,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };
  render(<NameBox {...props} />);
  return props;
}

describe('NameBox', () => {
  test.each([
    { keys: 'Ideas{Enter}', submitted: 'Ideas' },
    { keys: '  Ideas  {Enter}', submitted: 'Ideas' },
  ])('typing $keys submits $submitted', async ({ keys, submitted }) => {
    // given
    const props = renderBox();
    // when
    await userEvent.keyboard(keys);
    // then
    expect(props.onSubmit).toHaveBeenCalledWith(submitted);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  test('Escape cancels', async () => {
    // given
    const props = renderBox();
    await userEvent.keyboard('Ideas');
    // when
    await userEvent.keyboard('{Escape}');
    // then
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  test('Enter with an empty name cancels', async () => {
    // given
    const props = renderBox();
    await userEvent.keyboard('   ');
    // when
    await userEvent.keyboard('{Enter}');
    // then
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  test('is read-only while busy', async () => {
    // given
    const props = renderBox(true);
    // when
    await userEvent.keyboard('Ideas{Enter}');
    // then
    expect(screen.getByRole('textbox', { name: 'New note name' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'New note name' })).toHaveValue('');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  test('starts focused', () => {
    // given
    // when
    renderBox();
    // then
    expect(screen.getByRole('textbox', { name: 'New note name' })).toHaveFocus();
  });

  test('shows where the new item goes as its placeholder', () => {
    // given
    // when
    renderBox();
    // then
    expect(screen.getByRole('textbox', { name: 'New note name' })).toHaveAttribute(
      'placeholder',
      'Note name in Projects',
    );
  });

  test('starts with the given name', () => {
    // given
    const initial = 'Inbox';
    // when
    render(
      <NameBox label="New name" placeholder="" initial={initial} busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    // then
    expect(screen.getByRole('textbox', { name: 'New name' })).toHaveValue('Inbox');
  });
});
