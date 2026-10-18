import type { Dot, TabState } from '@shared/types';
import { render, screen } from '@testing-library/react';
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

  test('lists every project with its Jira key', () => {
    // given
    render(<ProjectMenu />);
    // when
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    // then
    expect(options).toEqual(['Bearclave (BEAR)', 'Dig Days (DIG)']);
  });

  test('shows the selected project', () => {
    // given
    useMaple.setState({ projectKey: 'DIG' });
    // when
    render(<ProjectMenu />);
    // then
    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('DIG');
  });

  test('choosing a project selects it', async () => {
    // given
    const selectProject = vi.fn();
    useMaple.setState({ selectProject });
    render(<ProjectMenu />);
    // when
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Project' }), 'DIG');
    // then
    expect(selectProject).toHaveBeenCalledWith('DIG');
  });

  test('shows waiting and ready counts for projects that have them', () => {
    // given
    const tab = (id: string, projectKey: string): TabState => ({
      id,
      projectKey,
      kind: 'card',
      cardKey: `${projectKey}-${id}`,
      sessionId: id,
      worktreePath: null,
    });
    const status = (tabId: string, dot: Dot) => ({ tabId, dot, sessionAlive: true, exitCode: null });
    useMaple.setState({
      tabs: [tab('1', 'DIG'), tab('2', 'DIG'), tab('3', 'BEAR')],
      statuses: { '1': status('1', 'waiting'), '2': status('2', 'ready'), '3': status('3', 'idle') },
    });
    // when
    render(<ProjectMenu />);
    // then
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Bearclave (BEAR)', 'Dig Days (DIG) · 1 waiting · 1 ready']);
  });

  test.each([
    { name: 'only waiting', dots: ['waiting', 'working'], want: 'Dig Days (DIG) · 1 waiting · 0 ready' },
    { name: 'only ready', dots: ['ready', 'ready'], want: 'Dig Days (DIG) · 0 waiting · 2 ready' },
    { name: 'neither', dots: ['working', 'idle'], want: 'Dig Days (DIG)' },
  ] as const)('labels a project with $name', ({ dots, want }) => {
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
        dots.map((dot: Dot, i) => [String(i + 1), { tabId: String(i + 1), dot, sessionAlive: true, exitCode: null }]),
      ),
    });
    // when
    render(<ProjectMenu />);
    // then
    expect(screen.getByRole('option', { name: want })).toBeInTheDocument();
  });
});
