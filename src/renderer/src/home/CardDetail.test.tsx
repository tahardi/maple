import type { Card, TabState } from '@shared/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { card } from '../testing/sprintFixture';
import { CardDetail } from './CardDetail';

const tab: TabState = {
  id: 't1',
  projectKey: 'DIG',
  kind: 'card',
  cardKey: 'DIG-41',
  sessionId: 's1',
  worktreePath: null,
};

function renderDetail(c: Card, t: TabState | null) {
  const handlers = { onStart: vi.fn(), onOpen: vi.fn(), onGoTo: vi.fn(), onClose: vi.fn() };
  render(<CardDetail card={c} tab={t} failure={null} {...handlers} />);
  return handlers;
}

describe('CardDetail', () => {
  test.each([
    { name: 'a card with a tab', status: 'In Progress' as const, hasTab: true, button: 'Go to tab', handler: 'onGoTo' },
    { name: 'a Done card with a tab', status: 'Done' as const, hasTab: true, button: 'Go to tab', handler: 'onGoTo' },
    { name: 'a To Do card', status: 'To Do' as const, hasTab: false, button: 'Start', handler: 'onStart' },
    { name: 'an In Progress card', status: 'In Progress' as const, hasTab: false, button: 'Open', handler: 'onOpen' },
    { name: 'an In Review card', status: 'In Review' as const, hasTab: false, button: 'Open', handler: 'onOpen' },
  ] as const)('$name shows $button', async ({ status, hasTab, button, handler }) => {
    // given
    const handlers = renderDetail(card('DIG-41', status), hasTab ? tab : null);
    // when
    await userEvent.click(screen.getByRole('button', { name: button }));
    // then
    const actions = screen.getAllByRole('button').filter((b) => b.textContent !== 'Close');
    expect(actions.map((b) => b.textContent)).toEqual([button]);
    expect(handlers[handler]).toHaveBeenCalledOnce();
  });

  test('a Done card without a tab shows no action', () => {
    // given
    renderDetail(card('DIG-40', 'Done'), null);
    // then
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Close']);
  });

  test('shows the description, points, labels, blockers, and Jira link', () => {
    // given
    renderDetail(card('DIG-41', 'To Do', { blockedBy: [{ key: 'DIG-44', status: 'In Progress' }] }), null);
    // then
    expect(screen.getByText('Goal:').tagName).toBe('STRONG');
    expect(screen.getByRole('complementary')).toHaveTextContent('3 pts');
    expect(screen.getByRole('complementary')).toHaveTextContent('parallelizable');
    expect(screen.getByRole('complementary')).toHaveTextContent('DIG-44 In Progress');
    const link = screen.getByRole('link', { name: 'Open in Jira' });
    expect(link).toHaveAttribute('href', 'https://example.atlassian.net/browse/DIG-41');
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('a card without blockers, points, or labels shows none', () => {
    // given
    renderDetail(card('DIG-39', 'Done', { points: null, labels: [] }), null);
    // then
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary')).not.toHaveTextContent('pts');
    expect(screen.getByRole('complementary')).not.toHaveTextContent('parallelizable');
  });

  test('renders the description Markdown', () => {
    // given
    const descriptionMd = [
      '## Steps',
      '',
      '- ~~DIG-40~~ done',
      '- read [the spec](https://example.com/spec)',
      '',
      '<img src=x onerror=alert(1)>',
    ].join('\n');
    // when
    renderDetail(card('DIG-41', 'To Do', { descriptionMd }), null);
    // then
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeInTheDocument();
    expect(screen.getByText('DIG-40').tagName).toBe('DEL');
    const link = screen.getByRole('link', { name: 'the spec' });
    expect(link).toHaveAttribute('href', 'https://example.com/spec');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('complementary').querySelector('img')).toBeNull();
  });

  test('Close calls onClose', async () => {
    // given
    const { onClose } = renderDetail(card('DIG-41', 'To Do'), null);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    // then
    expect(onClose).toHaveBeenCalledOnce();
  });
});
