import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMaple } from '@renderer/store';
import { DraftNotices } from './DraftNotices';

describe('DraftNotices', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('shows the save error for its path', () => {
    // given
    const saveError = { path: 'src/a.ts', message: 'writing src/a.ts: EACCES' };
    // when
    render(<DraftNotices tabId="t1" path="src/a.ts" draft={null} disk={'one\n'} saveError={saveError} />);
    // then
    expect(screen.getByRole('alert')).toHaveTextContent('Saving failed: writing src/a.ts: EACCES');
  });

  test('shows nothing for another path or a fresh draft', () => {
    // given
    const saveError = { path: 'src/b.ts', message: 'writing src/b.ts: EACCES' };
    const draft = { text: 'two\n', disk: 'one\n' };
    // when
    const { container } = render(
      <DraftNotices tabId="t1" path="src/a.ts" draft={draft} disk={'one\n'} saveError={saveError} />,
    );
    // then
    expect(container).toBeEmptyDOMElement();
  });

  test('Reload drops the draft and calls onReload', async () => {
    // given
    const draft = { text: 'mine\n', disk: 'one\n' };
    useMaple.getState().setDraft('t1', 'src/a.ts', draft);
    const onReload = vi.fn();
    render(
      <DraftNotices tabId="t1" path="src/a.ts" draft={draft} disk={'two\n'} saveError={null} onReload={onReload} />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    // then
    expect(useMaple.getState().drafts.t1).toEqual({});
    expect(onReload).toHaveBeenCalledOnce();
  });

  test('Keep mine moves the draft onto the disk text', async () => {
    // given
    const draft = { text: 'mine\n', disk: 'one\n' };
    useMaple.getState().setDraft('t1', 'src/a.ts', draft);
    render(<DraftNotices tabId="t1" path="src/a.ts" draft={draft} disk={'two\n'} saveError={null} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    // then
    expect(useMaple.getState().drafts.t1['src/a.ts']).toEqual({ text: 'mine\n', disk: 'two\n' });
  });
});
