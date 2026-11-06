import { act, fireEvent, render, screen } from '@testing-library/react';
import { NoteOverview } from './NoteOverview';

const copy = vi.hoisted(() => ({ rendered: vi.fn() }));

vi.mock('@renderer/shell/MarkdownText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/shell/MarkdownText')>();
  return {
    MarkdownText: (props: { text: string }) => {
      copy.rendered();
      return <actual.MarkdownText {...props} />;
    },
  };
});

function scroller(scrollTop = 1000) {
  const div = document.createElement('div');
  Object.defineProperty(div, 'clientWidth', { value: 720 });
  Object.defineProperty(div, 'clientHeight', { value: 200 });
  Object.defineProperty(div, 'scrollHeight', { value: 4000, writable: true });
  Object.defineProperty(div, 'scrollTop', { value: scrollTop, writable: true });
  return div;
}

function strip(top = 0) {
  const node = screen.getByTestId('note-overview');
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
  return node;
}

describe('NoteOverview', () => {
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  const resized: { value: () => void } = { value: () => undefined };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function ResizeObserver(cb: () => void) {
        resized.value = cb;
        return observer;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('draws a copy of the note hidden from screen readers', () => {
    // given
    const div = scroller();
    // when
    render(<NoteOverview text="## Findings" scroller={div} />);
    // then
    const overview = screen.getByTestId('note-overview');
    expect(overview).toHaveAttribute('aria-hidden', 'true');
    expect(overview).toHaveTextContent('Findings');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  test('keeps links in the copy out of tab order', () => {
    // given
    const div = scroller();
    // when
    render(<NoteOverview text="[Spec](https://example.com)" scroller={div} />);
    // then
    expect(screen.getByText('Spec').closest('[inert]')).not.toBeNull();
  });

  test('draws the slider over the visible part of the note', () => {
    // given
    const div = scroller();
    // when
    render(<NoteOverview text="## Findings" scroller={div} />);
    // then
    const slider = screen.getByTestId('note-overview-slider');
    expect(slider).toHaveStyle({ top: '50px', height: '10px' });
  });

  test('moves the slider when the note scrolls', () => {
    // given
    const div = scroller();
    render(<NoteOverview text="## Findings" scroller={div} />);
    // when
    div.scrollTop = 2000;
    fireEvent.scroll(div);
    // then
    expect(screen.getByTestId('note-overview-slider')).toHaveStyle({ top: '100px' });
  });

  test('does not redraw the copy when the note scrolls', () => {
    // given
    const div = scroller();
    render(<NoteOverview text="## Findings" scroller={div} />);
    copy.rendered.mockClear();
    // when
    div.scrollTop = 2000;
    fireEvent.scroll(div);
    // then
    expect(copy.rendered).not.toHaveBeenCalled();
  });

  test('refits the slider when the text changes the height of the note', () => {
    // given
    const div = scroller();
    const { rerender } = render(<NoteOverview text="## Findings" scroller={div} />);
    // when
    Object.defineProperty(div, 'scrollHeight', { value: 8000 });
    rerender(<NoteOverview text="## Longer findings" scroller={div} />);
    // then
    expect(screen.getByTestId('note-overview-slider')).toHaveStyle({ top: '25px', height: '5px' });
  });

  test('refits the slider when the note resizes', () => {
    // given
    const div = scroller();
    render(<NoteOverview text="## Findings" scroller={div} />);
    Object.defineProperty(div, 'scrollHeight', { value: 8000 });
    // when
    act(() => {
      resized.value();
    });
    // then
    expect(screen.getByTestId('note-overview-slider')).toHaveStyle({ top: '25px', height: '5px' });
  });

  test('follows a new scroller and leaves the old one', () => {
    // given
    const before = scroller();
    const after = scroller(3000);
    const { rerender } = render(<NoteOverview text="## Findings" scroller={before} />);
    // when
    rerender(<NoteOverview text="## Findings" scroller={after} />);
    before.scrollTop = 0;
    fireEvent.scroll(before);
    // then
    expect(screen.getByTestId('note-overview-slider')).toHaveStyle({ top: '150px' });
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  test('stops listening on unmount', () => {
    // given
    const div = scroller();
    const removed = vi.spyOn(div, 'removeEventListener');
    const { unmount } = render(<NoteOverview text="## Findings" scroller={div} />);
    // when
    unmount();
    // then
    expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  test.each([
    { name: 'pressing the strip scrolls the note to that spot', button: 0, top: 0, want: 1900 },
    { name: 'measures the press from the top of the strip', button: 0, top: 40, want: 1100 },
    { name: 'a right press leaves the note alone', button: 2, top: 0, want: 1000 },
  ])('$name', ({ button, top, want }) => {
    // given
    const div = scroller();
    render(<NoteOverview text="## Findings" scroller={div} />);
    // when
    fireEvent.mouseDown(strip(top), { button, clientY: 100 });
    // then
    expect(div.scrollTop).toBe(want);
  });

  test.each([
    { name: 'dragging with the button held keeps scrolling', buttons: 1, want: 2900 },
    { name: 'moving with no button held leaves the note alone', buttons: 0, want: 1900 },
  ])('$name', ({ buttons, want }) => {
    // given
    const div = scroller();
    render(<NoteOverview text="## Findings" scroller={div} />);
    const node = strip();
    fireEvent.mouseDown(node, { clientY: 100 });
    // when
    fireEvent.mouseMove(node, { buttons, clientY: 150 });
    // then
    expect(div.scrollTop).toBe(want);
  });

  test.each([
    { name: 'a drag that began in the note leaves the note alone', release: () => undefined },
    {
      name: 'a drag that left the strip stops',
      release: (node: HTMLElement) => {
        fireEvent.mouseDown(node, { clientY: 20 });
        fireEvent.mouseLeave(node);
      },
    },
    {
      name: 'a released drag stops',
      release: (node: HTMLElement) => {
        fireEvent.mouseDown(node, { clientY: 20 });
        fireEvent.mouseUp(node);
      },
    },
  ])('$name', ({ release }) => {
    // given
    const div = scroller();
    render(<NoteOverview text="## Findings" scroller={div} />);
    const node = strip();
    release(node);
    const top = div.scrollTop;
    // when
    fireEvent.mouseMove(node, { buttons: 1, clientY: 150 });
    // then
    expect(div.scrollTop).toBe(top);
  });

  test('draws nothing without a scroller', () => {
    // given
    const scrollerless = null;
    // when
    render(<NoteOverview text="## Findings" scroller={scrollerless} />);
    // then
    expect(screen.queryByTestId('note-overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-overview-slider')).not.toBeInTheDocument();
  });
});
