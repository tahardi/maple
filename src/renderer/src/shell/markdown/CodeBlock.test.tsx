import { act, render, screen } from '@testing-library/react';
import { CodeBlock } from './CodeBlock';
import { highlightCode } from './highlightCode';

vi.mock('./highlightCode');

describe('CodeBlock', () => {
  beforeEach(() => {
    vi.mocked(highlightCode).mockReset();
  });

  test('shows the code as plain text until highlighting finishes', () => {
    // given
    vi.mocked(highlightCode).mockReturnValue(new Promise(() => {}));
    // when
    const { container } = render(<CodeBlock code="const a = 1" lang="ts" />);
    // then
    expect(screen.getByText('const a = 1')).toBeInTheDocument();
    expect(container.querySelector('.mtk6')).toBeNull();
  });

  test('shows the highlighted code', async () => {
    // given
    vi.mocked(highlightCode).mockResolvedValue('<span class="mtk6">const</span> a = 1');
    // when
    const { container } = render(<CodeBlock code="const a = 1" lang="ts" />);
    // then
    await vi.waitFor(() => expect(container.querySelector('.mtk6')).toHaveTextContent('const'));
  });

  test.each([
    { name: 'the language is unknown', result: () => Promise.resolve(null) },
    { name: 'highlighting fails', result: () => Promise.reject(new Error('loading monaco: failed')) },
  ])('keeps plain text when $name', async ({ result }) => {
    // given
    const pending = result();
    pending.catch(() => {});
    vi.mocked(highlightCode).mockReturnValue(pending);
    // when
    const { container } = render(<CodeBlock code="const a = 1" lang="ts" />);
    await act(async () => {
      await pending.catch(() => {});
    });
    // then
    expect(screen.getByText('const a = 1')).toBeInTheDocument();
    expect(container.querySelector('.mtk6')).toBeNull();
  });

  test('ignores a highlight for code that has since changed', async () => {
    // given
    let resolveFirst: (html: string) => void = () => {};
    vi.mocked(highlightCode)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(new Promise(() => {}));
    const { container, rerender } = render(<CodeBlock code="const a = 1" lang="ts" />);
    // when
    rerender(<CodeBlock code="const b = 2" lang="ts" />);
    await act(async () => {
      resolveFirst('<span class="mtk6">const</span> a = 1');
      await Promise.resolve();
    });
    // then
    expect(screen.getByText('const b = 2')).toBeInTheDocument();
    expect(container.querySelector('.mtk6')).toBeNull();
  });

  test('drops the highlight when the language changes to one Monaco does not know', async () => {
    // given
    vi.mocked(highlightCode).mockResolvedValueOnce('<span class="mtk6">const</span> a = 1').mockResolvedValueOnce(null);
    const { container, rerender } = render(<CodeBlock code="const a = 1" lang="ts" />);
    await vi.waitFor(() => {
      expect(container.querySelector('.mtk6')).not.toBeNull();
    });
    // when
    rerender(<CodeBlock code="const a = 1" lang="nope" />);
    await act(async () => {
      await Promise.resolve();
    });
    // then
    expect(screen.getByText('const a = 1')).toBeInTheDocument();
    expect(container.querySelector('.mtk6')).toBeNull();
  });

  test('does nothing when unmounted before highlighting finishes', async () => {
    // given
    let resolve: (html: string) => void = () => {};
    vi.mocked(highlightCode).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<CodeBlock code="const a = 1" lang="ts" />);
    // when
    unmount();
    await act(async () => {
      resolve('<span class="mtk6">const</span> a = 1');
      await Promise.resolve();
    });
    // then
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
