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
});
