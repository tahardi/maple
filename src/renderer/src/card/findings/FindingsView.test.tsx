import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { finding, findingsFile } from '@renderer/testing/findingsFixture';
import { useMaple } from '@renderer/store';
import { FAKE_CONFIG, fakeMaple } from '@renderer/testing/fakeMaple';
import { lesson } from '@renderer/testing/lessonFixture';
import { FindingsView } from './FindingsView';

const visual = {
  path: [
    { actor: 'a stranger', step: 'Opens a pull request.', zone: 'GitHub' },
    { actor: 'the app', step: 'Runs a shell command.', zone: 'the app', crosses: 'the branch name' },
  ],
  reach: { now: ['Run commands.'], afterFix: [] },
};

function follows(later: Element, earlier: Element): boolean {
  return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const decided = { kind: 'fix-later' as const, reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };
const applied = { at: '2026-11-12T12:30:00.000Z', commit: 'abc1234', cardKey: null };

describe('FindingsView', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    fakeMaple();
  });

  test('opens every unaddressed finding and lists addressed ones as rows', () => {
    // given
    const file = findingsFile([
      finding({ id: 'F1', title: 'addressed', decision: decided, applied }),
      finding({ id: 'F2', title: 'decided only', severity: 'medium', decision: decided }),
      finding({ id: 'F3', title: 'undecided' }),
    ]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    const open = screen.getAllByRole('article').map((a) => within(a).getByRole('heading', { level: 3 }).textContent);
    expect(open).toEqual(['undecided', 'decided only']);
    expect(screen.getByRole('button', { name: /addressed/ })).toBeInTheDocument();
  });

  test('keeps an undecided finding open even when the file marks it applied', () => {
    // given
    const file = findingsFile([finding({ id: 'F1', title: 'forged', applied })]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    expect(within(screen.getByRole('article')).getByRole('heading', { level: 3 })).toHaveTextContent('forged');
  });

  test('opens a finding when its row is clicked', async () => {
    // given
    const file = findingsFile([finding({ id: 'F1', title: 'addressed', decision: decided, applied })]);
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: /addressed/ }));
    // then
    expect(within(screen.getByRole('article')).getByRole('heading', { level: 3 })).toHaveTextContent('addressed');
  });

  test('collapses an open finding back into a row', async () => {
    // given
    const file = findingsFile([finding({ id: 'F1', title: 'first' }), finding({ id: 'F2', title: 'second' })]);
    render(<FindingsView tabId="t1" file={file} error={null} />);
    const [first] = screen.getAllByRole('article');
    // when
    await userEvent.click(within(first).getByRole('button', { name: 'Collapse' }));
    // then
    expect(screen.getByRole('button', { name: /first/ })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  test('a row shows the recommendation, or the decision once made', async () => {
    // given
    const file = findingsFile([
      finding({ id: 'F1', title: 'recommended', recommend: { decision: 'accept-risk', why: 'Local only.' } }),
      finding({
        id: 'F2',
        title: 'addressed',
        decision: decided,
        applied,
        recommend: { decision: 'fix-now', why: 'Small.' },
      }),
    ]);
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    // then
    expect(screen.getByRole('button', { name: /recommended/ })).toHaveTextContent('Recommended: Accept risk');
    const done = screen.getByRole('button', { name: /addressed/ });
    expect(done).toHaveTextContent('Fix later');
    expect(done).not.toHaveTextContent('Recommended');
    expect(done).toHaveAttribute('data-decided', 'true');
  });

  test('keeps a finding open after Taylor decides it', () => {
    // given
    const undecided = finding({ id: 'F1', title: 'first' });
    const { rerender } = render(<FindingsView tabId="t1" file={findingsFile([undecided])} error={null} />);
    // when
    rerender(<FindingsView tabId="t1" file={findingsFile([{ ...undecided, decision: decided }])} error={null} />);
    // then
    expect(within(screen.getByRole('article')).getByRole('heading', { level: 3 })).toHaveTextContent('first');
  });

  test('shrinks a finding once Claude has addressed it, even if Taylor opened it', async () => {
    // given
    const open = finding({ id: 'F1', title: 'first', decision: decided });
    const { rerender } = render(<FindingsView tabId="t1" file={findingsFile([open])} error={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    await userEvent.click(screen.getByRole('button', { name: /first/ }));
    // when
    rerender(<FindingsView tabId="t1" file={findingsFile([{ ...open, applied }])} error={null} />);
    // then
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /first/ })).toBeInTheDocument();
  });

  test('shows a severity override instead of the reported severity', () => {
    // given
    const file = findingsFile([finding({ severity: 'high', severityOverride: 'medium' })]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    expect(screen.getByText('medium', { selector: 'span' })).toHaveAttribute('data-tone', 'warning');
    expect(screen.queryByText('high', { selector: 'span' })).not.toBeInTheDocument();
  });

  test('renders Markdown and HTML in finding text as plain text', () => {
    // given
    const title = '**bold** <img src=x onerror=alert(1)>';
    const file = findingsFile([finding({ title, what: '<b>y</b> [link](https://x.test)' })]);
    // when
    const { container } = render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText('<b>y</b> [link](https://x.test)')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  test('lists undecided findings first, then high before medium', () => {
    // given
    const file = findingsFile([
      finding({ id: 'F1', title: 'decided high', decision: decided }),
      finding({ id: 'F2', title: 'undecided medium', severity: 'medium' }),
      finding({ id: 'F3', title: 'undecided high' }),
      finding({ id: 'F4', title: 'undecided medium overridden high', severity: 'medium', severityOverride: 'high' }),
    ]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    const texts = Array.from(screen.getByRole('list', { name: 'Findings' }).children).map((item) => item.textContent);
    expect(texts).toHaveLength(4);
    ['undecided high', 'undecided medium overridden high', 'undecided medium', 'decided high'].forEach((title, i) => {
      expect(texts[i]).toContain(title);
    });
  });

  test('shows the read error in a notice', () => {
    // given
    const error = 'reading findings: MPL-20.json is from a newer Maple';
    // when
    render(<FindingsView tabId="t1" file={null} error={error} />);
    // then
    expect(screen.getByRole('alert')).toHaveTextContent(error);
  });

  test('says there are no findings without a file', () => {
    // given
    // when
    render(<FindingsView tabId="t1" file={null} error={null} />);
    // then
    expect(screen.getByText('No findings')).toBeInTheDocument();
  });

  test.each([
    { name: 'the tab is working', dot: 'working' as const, resume: null, reason: 'Claude is working' },
    {
      name: 'Claude is applying this round',
      dot: 'idle' as const,
      resume: { round: 1, sentAt: '2026-11-12T12:10:00.000Z' },
      reason: 'Claude is applying your decisions',
    },
    { name: 'an older round was resumed', dot: 'idle' as const, resume: { round: 0, sentAt: '' }, reason: null },
  ])('locks the controls when $name', ({ dot, resume, reason }) => {
    // given
    useMaple.setState({
      statuses: { t1: { tabId: 't1', dot, sessionAlive: true, exitCode: null, resumeFailed: false, sync: null } },
    });
    const file = { ...findingsFile([finding()]), resume };
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    const fixNow = screen.getByRole('button', { name: 'Fix now' });
    if (reason === null) {
      expect(fixNow).toBeEnabled();
    } else {
      expect(fixNow).toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
  });

  test('draws the visual parts a finding has between its chips and sections', () => {
    // given
    const file = findingsFile([finding({ id: 'F1', visual })]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    const full = screen.getByRole('article');
    const chip = within(full).getByText('could leak credentials');
    const headings = ['How the attack goes', 'What an attacker can do'].map((name) =>
      within(full).getByRole('heading', { name }),
    );
    const sections = within(full).getByRole('heading', { name: 'What it is' });
    for (const heading of headings) {
      expect(follows(heading, chip)).toBe(true);
      expect(follows(sections, heading)).toBe(true);
    }
    expect(within(full).getByText('Opens a pull request.')).toBeInTheDocument();
    expect(within(full).getByText('the branch name')).toBeInTheDocument();
    expect(within(full).queryByRole('heading', { name: 'Where it crosses' })).not.toBeInTheDocument();
    expect(within(full).getByText('Run commands.')).toBeInTheDocument();
  });

  test('draws only the visual parts a finding has', () => {
    // given
    const file = findingsFile([finding({ title: 'Partial', visual: { path: visual.path } })]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    expect(screen.getByRole('heading', { name: 'How the attack goes' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What an attacker can do' })).not.toBeInTheDocument();
  });

  test('shows plain text only for a finding without a visual', () => {
    // given
    const file = findingsFile([finding()]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    for (const name of ['How the attack goes', 'What an attacker can do']) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'What it is' })).toBeInTheDocument();
  });

  test('renders Markdown and HTML in visual text as plain text', () => {
    // given
    const step = '<img src=x onerror=alert(1)>';
    const file = findingsFile([
      finding({
        visual: {
          path: [
            { actor: '**bold**', step, zone: '<b>out</b>' },
            { actor: 'the app', step: '[link](https://x.test)', zone: 'in', crosses: '<i>file</i>' },
          ],
          reach: { now: ['<script>x</script>'], afterFix: [] },
        },
      }),
    ]);
    // when
    const { container } = render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    for (const text of [step, '**bold**', '[link](https://x.test)', '<i>file</i>', '<script>x</script>']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('region', { name: 'Less trusted · <b>out</b>' })).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('i')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  test('shows Open lesson once the vault gains a lesson for the class', async () => {
    // given
    const changed = { value: (): void => undefined };
    const list = vi.fn(() => Promise.resolve([lesson('command-injection')]));
    fakeMaple({
      learning: { list },
      vault: {
        onChanged: (cb) => {
          changed.value = cb;
          return vi.fn();
        },
      },
    });
    useMaple.setState({
      config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, vaultDir: '/vault' } },
    });
    render(<FindingsView tabId="t1" file={findingsFile([finding()])} error={null} />);
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(1);
    });
    list.mockResolvedValue([lesson('command-injection', { hasLesson: true })]);
    // when
    act(() => {
      changed.value();
    });
    // then
    expect(await screen.findByRole('button', { name: 'Open lesson' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Learn now' })).not.toBeInTheDocument();
  });

  test('keeps Learn now and Learn later when listing the lessons fails', async () => {
    // given
    const failure = Promise.reject(new Error('listing lessons: vault unreadable'));
    failure.catch(() => undefined);
    const list = vi.fn(() => failure);
    fakeMaple({ learning: { list } });
    useMaple.setState({
      config: { ...FAKE_CONFIG, data: FAKE_CONFIG.data && { ...FAKE_CONFIG.data, vaultDir: '/vault' } },
    });
    // when
    render(<FindingsView tabId="t1" file={findingsFile([finding()])} error={null} />);
    await act(() => failure.catch(() => undefined));
    // then
    expect(list).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Learn now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Learn later' })).toBeInTheDocument();
  });
});
