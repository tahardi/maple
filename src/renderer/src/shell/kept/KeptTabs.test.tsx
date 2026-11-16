import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KeptTab } from '@shared/types/tabs/keptTab';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { KeptTabs } from './KeptTabs';

const planner: KeptTab = {
  tab: {
    id: 'old-1',
    projectKey: 'HVD',
    kind: 'planner',
    cardKey: null,
    sessionId: 's-1',
    worktreePath: null,
    worktreePaths: [],
  },
  reason: 'project HVD is not in config',
};

const card: KeptTab = {
  tab: {
    id: 'old-2',
    projectKey: 'DIG',
    kind: 'card',
    cardKey: 'DIG-44',
    sessionId: 's-2',
    worktreePath: null,
    worktreePaths: [],
  },
  reason: 'starting session: spawn failed',
};

function setup(keptTabs: KeptTab[] = [planner, card]) {
  const discardKept = vi.fn(() => Promise.resolve());
  fakeMaple({ app: { discardKept } });
  useMaple.setState({ ...useMaple.getInitialState(), keptTabs }, true);
  const { container } = render(<KeptTabs />);
  return { discardKept, container };
}

describe('KeptTabs', () => {
  test('lists each kept tab with its reason', () => {
    // given
    setup();
    // when
    const items = screen.getAllByRole('listitem');
    // then
    expect(screen.getByText('Tabs kept until they can open again:')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('HVD Planner: project HVD is not in config');
    expect(items[1]).toHaveTextContent('DIG-44: starting session: spawn failed');
  });

  test('Discard asks to confirm, then drops only its own tab', async () => {
    // given
    const { discardKept } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Discard HVD Planner' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Discard tab' }));
    // then
    expect(discardKept).toHaveBeenCalledWith('old-1');
    expect(screen.queryByText(/HVD Planner/)).not.toBeInTheDocument();
    expect(screen.getByText(/DIG-44/)).toBeInTheDocument();
  });

  test('cancelling the dialog keeps the tab', async () => {
    // given
    const { discardKept } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Discard HVD Planner' }));
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // then
    expect(discardKept).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/HVD Planner/)).toBeInTheDocument();
  });

  test('shows nothing when no tabs are kept', () => {
    // given
    const { container } = setup([]);
    // when
    const html = container.innerHTML;
    // then
    expect(html).toBe('');
  });
});
