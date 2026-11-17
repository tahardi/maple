import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { lesson } from '@renderer/testing/lessonFixture';
import { LessonList } from './LessonList';

function rowOf(title: string): HTMLElement {
  const row = screen.getByRole('button', { name: title }).closest('li');
  if (row === null) {
    throw new Error(`finding row: ${title}`);
  }
  return row;
}

describe('LessonList', () => {
  beforeEach(() => {
    fakeMaple();
  });

  test('shows each note with its badges, last quiz, and finding count', () => {
    // given
    const lessons = [
      lesson('xss', { title: 'XSS', findings: 2 }),
      lesson('sqli', {
        title: 'SQL injection',
        status: 'learned',
        comfortable: true,
        lastGrade: { date: '2026-11-12', score: 4, total: 5 },
        findings: 1,
      }),
    ];
    // when
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={lessons}
        selected={null}
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // then
    expect(within(rowOf('XSS')).getByText('To learn')).toHaveAttribute('data-tone', 'warning');
    expect(within(rowOf('XSS')).getByText('2 findings')).toBeInTheDocument();
    expect(within(rowOf('XSS')).queryByText('Comfortable')).not.toBeInTheDocument();
    expect(within(rowOf('SQL injection')).getByText('Learned')).toHaveAttribute('data-tone', 'success');
    expect(within(rowOf('SQL injection')).getByText('Comfortable')).toHaveAttribute('data-tone', 'neutral');
    expect(within(rowOf('SQL injection')).getByText('Last quiz 4/5 on 2026-11-12')).toBeInTheDocument();
    expect(within(rowOf('SQL injection')).getByText('1 finding')).toBeInTheDocument();
  });

  test('lists to-learn notes first', () => {
    // given
    const lessons = [
      lesson('b', { title: 'B', status: 'learned' }),
      lesson('c', { title: 'C' }),
      lesson('a', { title: 'A', status: 'learned' }),
      lesson('d', { title: 'D' }),
    ];
    // when
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={lessons}
        selected={null}
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // then
    const titles = screen.getAllByRole('listitem').map((li) => within(li).getAllByRole('button')[0].textContent);
    expect(titles).toEqual(['C', 'D', 'A', 'B']);
  });

  test('clicking a title selects the note', async () => {
    // given
    const onSelect = vi.fn();
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={[lesson('xss', { title: 'XSS' })]}
        selected={null}
        onSelect={onSelect}
        onSaved={vi.fn()}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'XSS' }));
    // then
    expect(onSelect).toHaveBeenCalledWith('Learning/Security/xss.md');
  });

  test('clicking anywhere on a row selects the note', async () => {
    // given
    const onSelect = vi.fn();
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={[lesson('xss', { title: 'XSS', findings: 2 })]}
        selected={null}
        onSelect={onSelect}
        onSaved={vi.fn()}
      />,
    );
    // when
    await userEvent.click(screen.getByText('2 findings'));
    // then
    expect(onSelect).toHaveBeenCalledWith('Learning/Security/xss.md');
  });

  test('Mark comfortable does not select the note', async () => {
    // given
    const onSelect = vi.fn();
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={[lesson('xss', { title: 'XSS' })]}
        selected={null}
        onSelect={onSelect}
        onSaved={vi.fn()}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Mark comfortable' }));
    // then
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('Mark comfortable calls setComfortable and shows Saving…', async () => {
    // given
    let finish = (): void => undefined;
    const setComfortable = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fakeMaple({ learning: { setComfortable } });
    const onSaved = vi.fn();
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={[lesson('xss', { title: 'XSS' }), lesson('csrf', { title: 'CSRF', comfortable: true })]}
        selected={null}
        onSelect={vi.fn()}
        onSaved={onSaved}
      />,
    );
    expect(within(rowOf('CSRF')).getByRole('button', { name: 'Not comfortable' })).toBeInTheDocument();
    // when
    await userEvent.click(within(rowOf('XSS')).getByRole('button', { name: 'Mark comfortable' }));
    // then
    expect(setComfortable).toHaveBeenCalledWith('Learning/Security/xss.md', true);
    expect(within(rowOf('XSS')).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    finish();
    expect(await within(rowOf('XSS')).findByRole('button', { name: 'Mark comfortable' })).toBeEnabled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  test('Not comfortable clears the flag', async () => {
    // given
    const setComfortable = vi.fn(() => Promise.resolve());
    fakeMaple({ learning: { setComfortable } });
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={[lesson('csrf', { title: 'CSRF', comfortable: true })]}
        selected={null}
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Not comfortable' }));
    // then
    expect(setComfortable).toHaveBeenCalledWith('Learning/Security/csrf.md', false);
  });

  test('shows why saving failed', async () => {
    // given
    const setComfortable = vi.fn(() => Promise.reject(new Error('marking comfortable: x is not a lesson note')));
    fakeMaple({ learning: { setComfortable } });
    const onSaved = vi.fn();
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={[lesson('xss', { title: 'XSS' })]}
        selected={null}
        onSelect={vi.fn()}
        onSaved={onSaved}
      />,
    );
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Mark comfortable' }));
    // then
    expect(await screen.findByText('marking comfortable: x is not a lesson note')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  test('shows the empty text with no notes', () => {
    // given
    const lessons: [] = [];
    // when
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={lessons}
        selected={null}
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // then
    expect(
      screen.getByText('No lessons yet. They come from findings: choose Learn now or Learn later on a finding.'),
    ).toBeInTheDocument();
  });

  test('shows an unreadable note with its error', () => {
    // given
    const lessons = [lesson('csrf', { title: 'CSRF', error: 'reading frontmatter: bad indentation' })];
    // when
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={lessons}
        selected={null}
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // then
    expect(within(rowOf('CSRF')).getByText('reading frontmatter: bad indentation')).toBeInTheDocument();
    expect(within(rowOf('CSRF')).getByRole('button', { name: 'Mark comfortable' })).toBeDisabled();
    expect(within(rowOf('CSRF')).getByText("Fix this note's frontmatter first")).toBeInTheDocument();
  });

  test('marks the selected note', () => {
    // given
    const lessons = [lesson('xss', { title: 'XSS' }), lesson('csrf', { title: 'CSRF' })];
    // when
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={lessons}
        selected="Learning/Security/xss.md"
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // then
    expect(rowOf('XSS')).toHaveAttribute('aria-current', 'true');
    expect(rowOf('CSRF')).not.toHaveAttribute('aria-current');
  });
  test('Write lesson shows on notes with pending work and calls teach', async () => {
    // given
    const teach = vi.fn(() => Promise.resolve('learn-1'));
    fakeMaple({ learning: { teach } });
    const lessons = [lesson('xss', { title: 'XSS', pending: 2 }), lesson('csrf', { title: 'CSRF' })];
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={lessons}
        selected={null}
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // when
    await userEvent.click(within(rowOf('XSS')).getByRole('button', { name: 'Write lesson' }));
    // then
    expect(teach).toHaveBeenCalledWith('MPL', 'Learning/Security/xss.md');
    expect(within(rowOf('CSRF')).queryByRole('button', { name: 'Write lesson' })).not.toBeInTheDocument();
  });

  test('Write lesson is disabled with a reason while the Learning session is busy', () => {
    // given
    const lessons = [lesson('xss', { title: 'XSS', pending: 1 })];
    // when
    render(
      <LessonList
        projectKey="MPL"
        learningBusy
        lessons={lessons}
        selected={null}
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // then
    expect(within(rowOf('XSS')).getByRole('button', { name: 'Write lesson' })).toBeDisabled();
    expect(within(rowOf('XSS')).getByText('The Learning session is busy')).toBeInTheDocument();
  });

  test('Write lesson shows the error under the row when teach fails', async () => {
    // given
    const teach = vi.fn(() => Promise.reject(new Error('starting lesson: the Learning session is not running')));
    fakeMaple({ learning: { teach } });
    const lessons = [lesson('xss', { title: 'XSS', pending: 1 })];
    render(
      <LessonList
        projectKey="MPL"
        learningBusy={false}
        lessons={lessons}
        selected={null}
        onSelect={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // when
    await userEvent.click(within(rowOf('XSS')).getByRole('button', { name: 'Write lesson' }));
    // then
    expect(
      await within(rowOf('XSS')).findByText('starting lesson: the Learning session is not running'),
    ).toBeInTheDocument();
  });
});
