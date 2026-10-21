import type { TabState } from '@shared/types';
import { SUGGEST_PROMPT } from '@shared/prompts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { PlannerPane } from './PlannerPane';

vi.mock('../claude/ClaudePane', () => ({
  ClaudePane: ({ tabId }: { tabId: string }) => <div data-testid="claude-pane">{tabId}</div>,
}));

const PLANNER: TabState = {
  id: 'p1',
  projectKey: 'DIG',
  kind: 'planner',
  cardKey: null,
  sessionId: 's-p1',
  worktreePath: null,
};

type Options = {
  selected?: readonly string[];
  toAccept?: readonly string[];
  readyCount?: number;
  failure?: string | null;
};

function setup(
  { selected = [], toAccept = [], readyCount = 0, failure = null }: Options = {},
  planner: Promise<TabState> = Promise.resolve(PLANNER),
) {
  let emit: (keys: string[]) => void = () => undefined;
  const unsubscribe = vi.fn();
  const onBatchEvent = vi.fn((_projectKey: string, cb: (keys: string[]) => void) => {
    emit = cb;
    return unsubscribe;
  });
  const openPlanner = vi.fn(() => planner);
  const sendPrompt = vi.fn();
  fakeMaple({ tabs: { openPlanner }, session: { onBatch: onBatchEvent, sendPrompt } });
  const onBatch = vi.fn();
  const onSelectReady = vi.fn();
  const onStart = vi.fn();
  const onClear = vi.fn();
  const onAccept = vi.fn();
  const onAcceptAndStart = vi.fn();
  const { unmount } = render(
    <PlannerPane
      projectKey="DIG"
      onBatch={onBatch}
      selected={selected}
      readyCount={readyCount}
      onSelectReady={onSelectReady}
      onStart={onStart}
      onClear={onClear}
      toAccept={toAccept}
      onAccept={onAccept}
      onAcceptAndStart={onAcceptAndStart}
      failure={failure}
      roomPoints={9}
    />,
  );
  return {
    unmount,
    unsubscribe,
    openPlanner,
    sendPrompt,
    onBatch,
    onSelectReady,
    onStart,
    onClear,
    onAccept,
    onAcceptAndStart,
    onBatchEvent,
    emit: (keys: string[]) => {
      act(() => {
        emit(keys);
      });
    },
  };
}

describe('PlannerPane', () => {
  test('opens the project planner and shows its session', async () => {
    // given
    const { openPlanner } = setup();
    // when
    const pane = await screen.findByTestId('claude-pane');
    // then
    expect(openPlanner).toHaveBeenCalledWith('DIG');
    expect(pane).toHaveTextContent('p1');
  });

  test('Suggest next batch sends the exact prompt and clears the batch', async () => {
    // given
    const { sendPrompt, onBatch } = setup({ selected: ['DIG-44'] });
    await screen.findByTestId('claude-pane');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Suggest next batch' }));
    // then
    expect(sendPrompt).toHaveBeenCalledWith('p1', SUGGEST_PROMPT('DIG', 9));
    expect(onBatch).toHaveBeenCalledWith([]);
  });

  test('a batch event reaches onBatch', async () => {
    // given
    const { onBatch, onBatchEvent, emit } = setup();
    await screen.findByTestId('claude-pane');
    // when
    emit(['DIG-44', 'DIG-99']);
    // then
    expect(onBatchEvent).toHaveBeenCalledWith('DIG', expect.any(Function));
    expect(onBatch).toHaveBeenCalledWith(['DIG-44', 'DIG-99']);
  });

  test('Select ready (2) calls onSelectReady', async () => {
    // given
    const { onSelectReady } = setup({ readyCount: 2 });
    await screen.findByTestId('claude-pane');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Select ready (2)' }));
    // then
    expect(onSelectReady).toHaveBeenCalledTimes(1);
  });

  test('Select ready (0) is disabled', async () => {
    // given
    setup({ readyCount: 0 });
    // when
    await screen.findByTestId('claude-pane');
    // then
    expect(screen.getByRole('button', { name: 'Select ready (0)' })).toBeDisabled();
  });

  test('a selection shows Start (N) and Clear', async () => {
    // given
    const { onStart, onClear } = setup({ selected: ['DIG-41', 'DIG-42'] });
    await screen.findByTestId('claude-pane');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    // then
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test('no selection shows neither Start nor Clear', async () => {
    // given
    setup();
    // when
    await screen.findByTestId('claude-pane');
    // then
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  test('the bar shows its buttons in order', async () => {
    // given
    setup({ selected: ['DIG-41'], toAccept: ['DIG-50'], readyCount: 1 });
    // when
    await screen.findByTestId('claude-pane');
    // then
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Suggest next batch',
      'Select ready (1)',
      'Start (1)',
      'Clear',
      'Accept 1',
      'Accept 1 and start all',
    ]);
  });

  test('Accept N and Accept N and start all show the count and call their handlers', async () => {
    // given
    const { onAccept, onAcceptAndStart } = setup({ toAccept: ['DIG-50', 'DIG-51'] });
    await screen.findByTestId('claude-pane');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Accept 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept 2 and start all' }));
    // then
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAcceptAndStart).toHaveBeenCalledTimes(1);
  });

  test('no backlog cards to accept shows no Accept buttons', async () => {
    // given
    setup({ selected: ['DIG-41'] });
    // when
    await screen.findByTestId('claude-pane');
    // then
    expect(screen.queryByRole('button', { name: /^Accept/ })).not.toBeInTheDocument();
  });

  test('backlog cards to accept hide Nothing to start', async () => {
    // given
    const { emit } = setup({ toAccept: ['DIG-50'] });
    await screen.findByTestId('claude-pane');
    // when
    emit(['DIG-50']);
    // then
    expect(screen.queryByText('Nothing to start right now')).not.toBeInTheDocument();
  });

  test('a failure shows in an alert', async () => {
    // given
    setup({ selected: ['DIG-42'], failure: 'starting DIG-41: boom' });
    // when
    await screen.findByTestId('claude-pane');
    // then
    expect(screen.getByRole('alert')).toHaveTextContent(/^starting DIG-41: boom$/);
  });

  test('an empty batch shows Nothing to start and no Start button', async () => {
    // given
    const { emit } = setup();
    await screen.findByTestId('claude-pane');
    // when
    emit([]);
    // then
    await waitFor(() => {
      expect(screen.getByText('Nothing to start right now')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument();
  });

  test('no batch answer yet shows neither Start nor Nothing to start', async () => {
    // given
    setup();
    // when
    await screen.findByTestId('claude-pane');
    // then
    expect(screen.queryByText('Nothing to start right now')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument();
  });

  test('Suggest next batch is disabled until the planner opens', async () => {
    // given
    let open: (tab: TabState) => void = () => undefined;
    const { sendPrompt } = setup(
      {},
      new Promise<TabState>((resolve) => {
        open = resolve;
      }),
    );
    const button = screen.getByRole('button', { name: 'Suggest next batch' });
    // when
    await userEvent.click(button);
    // then
    expect(button).toBeDisabled();
    expect(sendPrompt).not.toHaveBeenCalled();
    await act(async () => {
      open(PLANNER);
      await Promise.resolve();
    });
    expect(button).toBeEnabled();
  });

  test('Suggest next batch hides Nothing to start until the next answer', async () => {
    // given
    const { emit } = setup();
    await screen.findByTestId('claude-pane');
    emit([]);
    expect(screen.getByText('Nothing to start right now')).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Suggest next batch' }));
    // then
    expect(screen.queryByText('Nothing to start right now')).not.toBeInTheDocument();
  });

  test('unmounting stops listening for batches', async () => {
    // given
    const { unmount, unsubscribe } = setup();
    await screen.findByTestId('claude-pane');
    // when
    unmount();
    // then
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
