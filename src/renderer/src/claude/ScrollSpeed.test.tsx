import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScrollSpeed } from './ScrollSpeed';

function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Pane settings' }));
}

describe('ScrollSpeed', () => {
  test('hides the speed until Pane settings opens', () => {
    // given
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    const inputBeforeOpening = screen.queryByLabelText('Scroll speed');
    // when
    openSettings();
    // then
    expect(inputBeforeOpening).toBeNull();
    expect(screen.getByLabelText('Scroll speed')).toHaveValue(4);
    expect(screen.getByRole('button', { name: 'Pane settings' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('Escape closes the settings', () => {
    // given
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    openSettings();
    // when
    fireEvent.keyDown(document, { key: 'Escape' });
    // then
    expect(screen.queryByLabelText('Scroll speed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pane settings' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('a click outside closes the settings', () => {
    // given
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    openSettings();
    // when
    fireEvent.pointerDown(document.body);
    // then
    expect(screen.queryByLabelText('Scroll speed')).toBeNull();
  });

  test.each([
    { name: 'a click', act: (input: HTMLElement) => fireEvent.pointerDown(input) },
    { name: 'focus', act: (input: HTMLElement) => fireEvent.focusIn(input) },
  ])('$name inside the panel keeps the settings open', ({ act }) => {
    // given
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    openSettings();
    // when
    act(screen.getByLabelText('Scroll speed'));
    // then
    expect(screen.getByLabelText('Scroll speed')).toBeInTheDocument();
  });

  test('a second click on Pane settings closes the settings', () => {
    // given
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Pane settings' });
    const expandedBeforeOpening = button.getAttribute('aria-expanded');
    openSettings();
    // when
    openSettings();
    // then
    expect(expandedBeforeOpening).toBe('false');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Scroll speed')).toBeNull();
  });

  test('shows the unit next to the speed', () => {
    // given
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    // when
    openSettings();
    // then
    expect(screen.getByText('lines per notch')).toBeInTheDocument();
  });

  test('reopening shows the latest saved speed', () => {
    // given
    const { rerender } = render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    openSettings();
    rerender(<ScrollSpeed value={9} onChange={vi.fn()} onClose={vi.fn()} />);
    openSettings();
    // when
    openSettings();
    // then
    expect(screen.getByLabelText('Scroll speed')).toHaveValue(9);
  });

  test('reopening drops a speed that was never saved', () => {
    // given
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    openSettings();
    fireEvent.change(screen.getByLabelText('Scroll speed'), { target: { value: '99' } });
    openSettings();
    // when
    openSettings();
    // then
    expect(screen.getByLabelText('Scroll speed')).toHaveValue(4);
  });

  test.each([
    { name: 'Escape', close: () => fireEvent.keyDown(document, { key: 'Escape' }) },
    { name: 'a second click on Pane settings', close: openSettings },
  ])('$name hands focus back through onClose', ({ close }) => {
    // given
    const onClose = vi.fn();
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={onClose} />);
    openSettings();
    screen.getByLabelText('Scroll speed').focus();
    // when
    close();
    // then
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('tabbing out closes the settings without onClose', async () => {
    // given
    const onClose = vi.fn();
    render(
      <>
        <ScrollSpeed value={4} onChange={vi.fn()} onClose={onClose} />
        <button>Elsewhere</button>
      </>,
    );
    openSettings();
    screen.getByLabelText('Scroll speed').focus();
    // when
    await userEvent.tab();
    // then
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    expect(screen.queryByLabelText('Scroll speed')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('shows the current speed', () => {
    // given
    render(<ScrollSpeed value={4} onChange={vi.fn()} onClose={vi.fn()} />);
    // when
    openSettings();
    // then
    expect(screen.getByLabelText('Scroll speed')).toHaveValue(4);
  });

  test.each([
    { name: 'a speed in range', typed: '8', saved: [[8]] },
    { name: 'the lowest speed', typed: '1', saved: [[1]] },
    { name: 'the highest speed', typed: '20', saved: [[20]] },
    { name: 'an empty field', typed: '', saved: [] },
    { name: 'zero', typed: '0', saved: [] },
    { name: 'a speed above 20', typed: '21', saved: [] },
    { name: 'a fraction', typed: '2.5', saved: [] },
  ])('typing $name saves only valid speeds', ({ typed, saved }) => {
    // given
    const onChange = vi.fn();
    render(<ScrollSpeed value={3} onChange={onChange} onClose={vi.fn()} />);
    openSettings();
    // when
    fireEvent.change(screen.getByLabelText('Scroll speed'), { target: { value: typed } });
    // then
    expect(onChange.mock.calls).toEqual(saved);
  });
});
