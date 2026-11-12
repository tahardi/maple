import type { Card } from '@shared/types/jira/card';
import type { TabState } from '@shared/types/tabs/tabState';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { card } from '../testing/sprintFixture';
import { useRef } from 'react';
import { Dialog } from '@renderer/shell/blocks/Dialog';
import { useDismiss } from '@renderer/shell/menu/useDismiss';
import { CardDetail } from './CardDetail';

const tab: TabState = {
  id: 't1',
  projectKey: 'DIG',
  kind: 'card',
  cardKey: 'DIG-41',
  sessionId: 's1',
  worktreePath: null,
  worktreePaths: [],
};

function OpenMenu({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onDismiss);
  return <div ref={ref}>menu</div>;
}

function renderDetail(c: Card, t: TabState | null, busy = false) {
  const handlers = { onStart: vi.fn(), onOpen: vi.fn(), onGoTo: vi.fn(), onClose: vi.fn() };
  render(<CardDetail card={c} tab={t} busy={busy} {...handlers} />);
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
    const actions = screen.getAllByRole('button').filter((b) => b.textContent !== '×');
    expect(actions.map((b) => b.textContent)).toEqual([button]);
    expect(handlers[handler]).toHaveBeenCalledOnce();
  });

  test('a Done card without a tab shows no action', () => {
    // given
    renderDetail(card('DIG-40', 'Done'), null);
    // then
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['×']);
  });

  test('shows the status and labels as neutral badges', () => {
    // given
    // when
    renderDetail(card('DIG-41', 'To Do'), null);
    // then
    expect(screen.getByText('To Do')).toHaveAttribute('data-tone', 'neutral');
    expect(screen.getByText('parallelizable')).toHaveAttribute('data-tone', 'neutral');
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

  test('shows the epic lozenge', () => {
    // given
    renderDetail(card('DIG-41', 'To Do', { epic: { key: 'DIG-2', summary: 'Search', color: 'green' } }), null);
    // when
    const lozenge = within(screen.getByRole('complementary')).getByText('Search');
    // then
    expect(lozenge).toHaveAttribute('data-color', 'green');
  });

  test('a card without blockers, points, or labels shows none', () => {
    // given
    renderDetail(card('DIG-39', 'Done', { points: null, labels: [] }), null);
    // then
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Blocked by' })).not.toBeInTheDocument();
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

  test.each([
    { name: 'a backlog card', status: 'To Do' as const, hasTab: false },
    { name: 'an In Progress backlog card', status: 'In Progress' as const, hasTab: false },
    { name: 'a backlog card with a tab', status: 'In Progress' as const, hasTab: true },
  ])('$name offers Add to sprint instead of Start', async ({ status, hasTab }) => {
    // given
    const onAddToSprint = vi.fn();
    render(
      <CardDetail
        card={card('DIG-41', status)}
        tab={hasTab ? tab : null}
        busy={false}
        onStart={vi.fn()}
        onOpen={vi.fn()}
        onGoTo={vi.fn()}
        onClose={vi.fn()}
        onAddToSprint={onAddToSprint}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Add to sprint' }));
    // then
    const actions = screen.getAllByRole('button').filter((b) => b.textContent !== '×');
    expect(actions.map((b) => b.textContent)).toEqual(['Add to sprint']);
    expect(onAddToSprint).toHaveBeenCalledOnce();
  });

  test('Add to sprint is disabled without an active sprint', () => {
    // given
    render(
      <CardDetail
        card={card('DIG-41', 'To Do')}
        tab={null}
        busy={false}
        onStart={vi.fn()}
        onOpen={vi.fn()}
        onGoTo={vi.fn()}
        onClose={vi.fn()}
        onAddToSprint={null}
      />,
    );
    // then
    const button = screen.getByRole('button', { name: 'Add to sprint' });
    expect(button).toBeDisabled();
    expect(screen.getByText('No active sprint')).toBeVisible();
    expect(button).toHaveAccessibleDescription('No active sprint');
  });

  test.each([
    { label: 'Start', busyLabel: 'Starting…', status: 'To Do' as const, addToSprint: false },
    { label: 'Open', busyLabel: 'Opening…', status: 'In Progress' as const, addToSprint: false },
    { label: 'Add to sprint', busyLabel: 'Moving…', status: 'To Do' as const, addToSprint: true },
  ])('$label reads $busyLabel while busy', ({ busyLabel, status, addToSprint }) => {
    // given
    const onAddToSprint = addToSprint ? vi.fn() : undefined;
    // when
    render(
      <CardDetail
        card={card('DIG-41', status)}
        tab={null}
        busy
        onStart={vi.fn()}
        onOpen={vi.fn()}
        onGoTo={vi.fn()}
        onClose={vi.fn()}
        onAddToSprint={onAddToSprint}
      />,
    );
    // then
    const button = screen.getByRole('button', { name: busyLabel });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  test('hides Blocked by when every blocker is Done', () => {
    // given
    const blockedBy = [
      { key: 'DIG-44', status: 'Done' as const },
      { key: 'DIG-45', status: 'Done' as const },
    ];
    // when
    renderDetail(card('DIG-41', 'To Do', { blockedBy }), null);
    // then
    expect(screen.queryByRole('heading', { name: 'Blocked by' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('lists every blocker when one is still open', () => {
    // given
    const blockedBy = [
      { key: 'DIG-44', status: 'Done' as const },
      { key: 'DIG-45', status: 'In Progress' as const },
    ];
    // when
    renderDetail(card('DIG-41', 'To Do', { blockedBy }), null);
    // then
    expect(screen.getByRole('heading', { name: 'Blocked by' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['DIG-44 Done', 'DIG-45 In Progress']);
  });

  test('labels the blockers', () => {
    // given
    const blocked = card('DIG-41', 'To Do', { blockedBy: [{ key: 'DIG-44', status: 'In Progress' }] });
    // when
    renderDetail(blocked, null);
    // then
    expect(screen.getByRole('heading', { name: 'Blocked by' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent(/^DIG-44 In Progress$/);
  });

  test.each([
    { label: 'Start', status: 'To Do' as const, hasTab: false },
    { label: 'Open', status: 'In Progress' as const, hasTab: false },
    { label: 'Go to tab', status: 'In Progress' as const, hasTab: true },
  ])('the $label action is primary', ({ label, status, hasTab }) => {
    // given
    const current = hasTab ? tab : null;
    // when
    renderDetail(card('DIG-41', status), current);
    // then
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('data-variant', 'primary');
  });

  test.each([
    { state: 'enabled', onAddToSprint: vi.fn(), disabled: false },
    { state: 'disabled', onAddToSprint: null, disabled: true },
  ])('Add to sprint is primary when $state', ({ onAddToSprint, disabled }) => {
    // given
    const handlers = { onStart: vi.fn(), onOpen: vi.fn(), onGoTo: vi.fn(), onClose: vi.fn() };
    // when
    render(
      <CardDetail card={card('DIG-41', 'To Do')} tab={null} busy={false} {...handlers} onAddToSprint={onAddToSprint} />,
    );
    // then
    const button = screen.getByRole('button', { name: 'Add to sprint' });
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect((button as HTMLButtonElement).disabled).toBe(disabled);
  });

  test('the close button is not primary', () => {
    // given
    const todo = card('DIG-41', 'To Do');
    // when
    renderDetail(todo, null);
    // then
    expect(screen.getByRole('button', { name: 'Close details' })).not.toHaveAttribute('data-variant');
  });

  test('Close calls onClose', async () => {
    // given
    const { onClose } = renderDetail(card('DIG-41', 'To Do'), null);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    // then
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('Escape calls onClose', async () => {
    // given
    const { onClose } = renderDetail(card('DIG-41', 'To Do'), null);
    // when
    await userEvent.keyboard('{Escape}');
    // then
    expect(onClose).toHaveBeenCalledOnce();
  });

  test.each(['{Enter}', 'a'])('%s does not call onClose', async (key) => {
    // given
    const { onClose } = renderDetail(card('DIG-41', 'To Do'), null);
    // when
    await userEvent.keyboard(key);
    // then
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Escape after unmount does not call onClose', async () => {
    // given
    const handlers = { onStart: vi.fn(), onOpen: vi.fn(), onGoTo: vi.fn(), onClose: vi.fn() };
    const { unmount } = render(<CardDetail card={card('DIG-41', 'To Do')} tab={null} busy={false} {...handlers} />);
    unmount();
    // when
    await userEvent.keyboard('{Escape}');
    // then
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  test('Escape on a hidden page does not call onClose', async () => {
    // given
    const handlers = { onStart: vi.fn(), onOpen: vi.fn(), onGoTo: vi.fn(), onClose: vi.fn() };
    render(
      <div hidden>
        <CardDetail card={card('DIG-41', 'To Do')} tab={null} busy={false} {...handlers} />
      </div>,
    );
    // when
    await userEvent.keyboard('{Escape}');
    // then
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  test('Escape while a dialog is open does not call onClose', async () => {
    // given
    const handlers = { onStart: vi.fn(), onOpen: vi.fn(), onGoTo: vi.fn(), onClose: vi.fn() };
    render(
      <>
        <CardDetail card={card('DIG-41', 'To Do')} tab={null} busy={false} {...handlers} />
        <Dialog title="Keyboard shortcuts" onClose={vi.fn()}>
          <p>sheet</p>
        </Dialog>
      </>,
    );
    // when
    await userEvent.keyboard('{Escape}');
    // then
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  test('Escape that closes an open menu does not call onClose', async () => {
    // given
    const onDismiss = vi.fn();
    const handlers = { onStart: vi.fn(), onOpen: vi.fn(), onGoTo: vi.fn(), onClose: vi.fn() };
    render(
      <>
        <CardDetail card={card('DIG-41', 'To Do')} tab={null} busy={false} {...handlers} />
        <OpenMenu onDismiss={onDismiss} />
      </>,
    );
    // when
    await userEvent.keyboard('{Escape}');
    // then
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(handlers.onClose).not.toHaveBeenCalled();
  });
});
