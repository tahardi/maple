import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('opens as a modal named by its title', () => {
    // given
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    // when
    render(
      <Dialog title="Quit Maple" onClose={vi.fn()}>
        <p>Sessions are still working.</p>
      </Dialog>,
    );
    // then
    expect(showModal).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: 'Quit Maple' })).toHaveTextContent('Sessions are still working.');
  });

  test('the cancel event calls onClose and keeps the dialog open', () => {
    // given
    const onClose = vi.fn();
    render(
      <Dialog title="Quit Maple" onClose={onClose}>
        <p>body</p>
      </Dialog>,
    );
    const event = new Event('cancel', { cancelable: true });
    // when
    fireEvent(screen.getByRole('dialog'), event);
    // then
    expect(onClose).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  test('focuses the element marked data-autofocus', () => {
    // given
    const children = (
      <>
        <button>First</button>
        <input aria-label="Title" data-autofocus />
      </>
    );
    // when
    render(
      <Dialog title="Report" onClose={vi.fn()}>
        {children}
      </Dialog>,
    );
    // then
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
  });
});
