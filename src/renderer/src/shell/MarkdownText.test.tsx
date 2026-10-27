import { render, screen } from '@testing-library/react';
import { MarkdownText } from './MarkdownText';
import { highlightCode } from './highlightCode';

vi.mock('./highlightCode', () => ({
  highlightCode: vi.fn(() => Promise.resolve('<span class="mtk6">const</span> a = 1')),
}));

describe('MarkdownText', () => {
  beforeEach(() => {
    vi.mocked(highlightCode).mockClear();
  });

  test.each([
    { name: 'a bullet list', text: '- one\n- two', role: 'listitem', count: 2 },
    { name: 'a heading', text: '## Steps', role: 'heading', count: 1 },
    { name: 'a link', text: '[spec](https://example.com/spec)', role: 'link', count: 1 },
  ])('renders $name', ({ text, role, count }) => {
    // given
    render(<MarkdownText text={text} />);
    // then
    expect(screen.getAllByRole(role)).toHaveLength(count);
  });

  test.each([
    { name: 'inline code', text: 'run `make pre-pr`', content: 'make pre-pr', tag: 'CODE' },
    { name: 'bold', text: '**Goal:** ship', content: 'Goal:', tag: 'STRONG' },
    { name: 'strikethrough', text: '~~DIG-40~~ done', content: 'DIG-40', tag: 'DEL' },
  ])('renders $name as $tag', ({ text, content, tag }) => {
    // given
    render(<MarkdownText text={text} />);
    // then
    expect(screen.getByText(content).tagName).toBe(tag);
  });

  test('opens links in a new window', () => {
    // given
    render(<MarkdownText text="[spec](https://example.com/spec)" />);
    // then
    const link = screen.getByRole('link', { name: 'spec' });
    expect(link).toHaveAttribute('href', 'https://example.com/spec');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  test('does not render raw HTML', () => {
    // given
    const { container } = render(<MarkdownText text={'before\n\n<img src=x onerror=alert(1)>\n\nafter'} />);
    // then
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('before');
    expect(container).toHaveTextContent('after');
  });

  test('highlights a fenced block that names its language', async () => {
    // given
    const text = '```ts\nconst a = 1\n```';
    // when
    const { container } = render(<MarkdownText text={text} />);
    // then
    await vi.waitFor(() => {
      expect(highlightCode).toHaveBeenCalledWith('const a = 1', 'ts');
    });
    await vi.waitFor(() => expect(container.querySelector('.mtk6')).toHaveTextContent('const'));
  });

  test('leaves a fenced block without a language plain', () => {
    // given
    const text = '```\nconst a = 1\n```';
    // when
    render(<MarkdownText text={text} />);
    // then
    expect(highlightCode).not.toHaveBeenCalled();
    expect(screen.getByText('const a = 1')).toBeInTheDocument();
  });
});
