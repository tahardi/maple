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

function setup(batch: readonly string[] = [], planner: Promise<TabState> = Promise.resolve(PLANNER)) {
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
  const onStartAll = vi.fn();
  const { unmount } = render(<PlannerPane projectKey="DIG" onBatch={onBatch} batch={batch} onStartAll={onStartAll} />);
  return {
    unmount,
    unsubscribe,
    openPlanner,
    sendPrompt,
    onBatch,
    onStartAll,
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
    const { sendPrompt, onBatch } = setup(['DIG-44']);
    await screen.findByTestId('claude-pane');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Suggest next batch' }));
    // then
    expect(sendPrompt).toHaveBeenCalledWith('p1', SUGGEST_PROMPT('DIG'));
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

  test('Start all N shows the count and calls onStartAll', async () => {
    // given
    const { onStartAll } = setup(['DIG-41']);
    await screen.findByTestId('claude-pane');
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Start all 1' }));
    // then
    expect(onStartAll).toHaveBeenCalledTimes(1);
  });

  test('an empty batch shows Nothing to start and no Start all button', async () => {
    // given
    const { emit } = setup([]);
    await screen.findByTestId('claude-pane');
    // when
    emit([]);
    // then
    await waitFor(() => {
      expect(screen.getByText('Nothing to start right now')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Start all/ })).not.toBeInTheDocument();
  });

  test('no batch answer yet shows neither Start all nor Nothing to start', async () => {
    // given
    setup([]);
    // when
    await screen.findByTestId('claude-pane');
    // then
    expect(screen.queryByText('Nothing to start right now')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start all/ })).not.toBeInTheDocument();
  });

  test('Suggest next batch is disabled until the planner opens', async () => {
    // given
    let open: (tab: TabState) => void = () => undefined;
    const { sendPrompt } = setup(
      [],
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
    const { emit } = setup([]);
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
