import type { Dot, TabState } from '@shared/types/tabs';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '../store';
import { FAKE_CONFIG, fakeMaple } from '../testing/fakeMaple';
import { ProjectMenu } from './ProjectMenu';

describe('ProjectMenu', () => {
  beforeEach(() => {
    fakeMaple();
    useMaple.setState(useMaple.getInitialState(), true);
    useMaple.setState({ config: FAKE_CONFIG, projectKey: 'BEAR' });
  });

  const openMenu = () => userEvent.click(screen.getByRole('button', { name: 'Project' }));
  const rows = () => screen.getAllByRole('menuitemradio').map((o) => o.textContent);

  test('lists every project with its Jira key', async () => {
    // given
    render(<ProjectMenu />);
    // when
    await openMenu();
    // then
    expect(rows()).toEqual(['Bearclave (BEAR)', 'Dig Days (DIG)']);
  });

  test('shows the selected project', async () => {
    // given
    useMaple.setState({ projectKey: 'DIG' });
    render(<ProjectMenu />);
    // when
    await openMenu();
    // then
    expect(screen.getByRole('button', { name: 'Project' })).toHaveTextContent('Dig Days (DIG)');
    expect(screen.getByRole('menuitemradio', { checked: true })).toHaveTextContent('Dig Days (DIG)');
  });

  test('choosing a project selects it and closes the menu', async () => {
    // given
    const selectProject = vi.fn();
    useMaple.setState({ selectProject });
    render(<ProjectMenu />);
    await openMenu();
    // when
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dig Days (DIG)' }));
    // then
    expect(selectProject).toHaveBeenCalledWith('DIG');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('clicking the button again closes the menu', async () => {
    // given
    render(<ProjectMenu />);
    await openMenu();
    // when
    await openMenu();
    // then
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test.each([
    { name: 'clicking elsewhere in the app', leave: () => userEvent.click(document.body) },
    { name: 'leaving the window', leave: () => Promise.resolve(fireEvent.blur(window)) },
  ])('$name closes the menu', async ({ leave }) => {
    // given
    render(<ProjectMenu />);
    await openMenu();
    // when
    await leave();
    // then
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test.each([
    { name: 'no project is selected', state: { projectKey: null }, rows: 2 },
    { name: 'the config has not loaded', state: { config: null, projectKey: null }, rows: 0 },
  ])('still opens when $name', async ({ state, rows: want }) => {
    // given
    useMaple.setState(state);
    render(<ProjectMenu />);
    // when
    await openMenu();
    // then
    expect(screen.getByRole('button', { name: 'Project' })).toHaveTextContent('▾');
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(want);
  });

  test('shows waiting and ready counts for projects that have them', async () => {
    // given
    const tab = (id: string, projectKey: string): TabState => ({
      id,
      projectKey,
      kind: 'card',
      cardKey: `${projectKey}-${id}`,
      sessionId: id,
      worktreePath: null,
    });
    const status = (tabId: string, dot: Dot) => ({
      tabId,
      dot,
      sessionAlive: true,
      exitCode: null,
      resumeFailed: false,
    });
    useMaple.setState({
      tabs: [tab('1', 'DIG'), tab('2', 'DIG'), tab('3', 'BEAR')],
      statuses: { '1': status('1', 'waiting'), '2': status('2', 'ready'), '3': status('3', 'idle') },
    });
    render(<ProjectMenu />);
    // when
    await openMenu();
    // then
    expect(rows()).toEqual(['Bearclave (BEAR)', 'Dig Days (DIG) · 1 waiting · 1 ready']);
  });

  test.each([
    { name: 'only waiting', dots: ['waiting', 'working'], want: 'Dig Days (DIG) · 1 waiting · 0 ready' },
    { name: 'only ready', dots: ['ready', 'ready'], want: 'Dig Days (DIG) · 0 waiting · 2 ready' },
    { name: 'neither', dots: ['working', 'idle'], want: 'Dig Days (DIG)' },
  ] as const)('labels a project with $name', async ({ dots, want }) => {
    // given
    const tab = (id: string): TabState => ({
      id,
      projectKey: 'DIG',
      kind: 'card',
      cardKey: `DIG-${id}`,
      sessionId: id,
      worktreePath: null,
    });
    useMaple.setState({
      tabs: [tab('1'), tab('2')],
      statuses: Object.fromEntries(
        dots.map((dot: Dot, i) => [
          String(i + 1),
          { tabId: String(i + 1), dot, sessionAlive: true, exitCode: null, resumeFailed: false },
        ]),
      ),
    });
    render(<ProjectMenu />);
    // when
    await openMenu();
    // then
    expect(screen.getByRole('menuitemradio', { name: want })).toBeInTheDocument();
  });
});
