import { render, screen, within } from '@testing-library/react';
import { finding, findingsFile } from '@renderer/testing/findingsFixture';
import { useMaple } from '@renderer/store';
import { FindingsView } from './FindingsView';

const visual = {
  path: [
    { actor: 'a stranger', step: 'Opens a pull request.' },
    { actor: 'the app', step: 'Runs a shell command.' },
  ],
  map: { zones: ['the internet', 'GitHub', 'the app'], from: 'GitHub', to: 'the app' },
  reach: { now: ['Run commands.'], afterFix: [] },
};

function follows(later: Element, earlier: Element): boolean {
  return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const decided = { kind: 'fix-later' as const, reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };

describe('FindingsView', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('shows each finding with its severity badge, chips, and the four sections', () => {
    // given
    const file = findingsFile([
      finding(),
      finding({
        id: 'F2',
        severity: 'medium',
        title: 'Old lodash',
        identity: { kind: 'dependency', advisory: 'GHSA-1234-5678-9abc', package: 'lodash' },
        line: null,
        chips: ['supply-chain'],
      }),
    ]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    const [first, second] = screen.getAllByRole('article');
    expect(within(first).getByRole('heading', { name: 'Branch name reaches a shell' })).toBeInTheDocument();
    expect(within(first).getByText('high', { selector: 'span' })).toHaveAttribute('data-tone', 'danger');
    expect(within(first).getByText('could run attacker code')).toHaveAttribute('data-tone', 'neutral');
    expect(within(first).getByText('could leak credentials')).toBeInTheDocument();
    expect(within(first).getByText('src/main/x.ts:42')).toBeInTheDocument();
    for (const [label, text] of [
      ['What it is', 'A branch name is put into a shell command.'],
      ['How someone uses it', 'Someone who names a branch can run commands.'],
      ['What it means here', 'They could read the Jira token.'],
      ['How to defend', 'Pass arguments as an array.'],
    ]) {
      expect(within(first).getByRole('heading', { name: label })).toBeInTheDocument();
      expect(within(first).getByText(text)).toBeInTheDocument();
    }
    expect(within(second).getByText('medium', { selector: 'span' })).toHaveAttribute('data-tone', 'warning');
    expect(within(second).getByText('could sneak in bad code')).toBeInTheDocument();
    expect(within(second).getByText('lodash GHSA-1234-5678-9abc')).toBeInTheDocument();
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
    const titles = screen.getAllByRole('article').map((a) => within(a).getAllByRole('heading')[0].textContent);
    expect(titles).toEqual(['undecided high', 'undecided medium overridden high', 'undecided medium', 'decided high']);
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
    const file = findingsFile([
      finding({ id: 'F1', visual }),
      finding({ id: 'F2', title: 'Partial', visual: { path: visual.path } }),
    ]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    const [full, partial] = screen.getAllByRole('article');
    const chip = within(full).getByText('could leak credentials');
    const headings = ['How the attack goes', 'Where it crosses', 'What an attacker can do'].map((name) =>
      within(full).getByRole('heading', { name }),
    );
    const sections = within(full).getByRole('heading', { name: 'What it is' });
    for (const heading of headings) {
      expect(follows(heading, chip)).toBe(true);
      expect(follows(sections, heading)).toBe(true);
    }
    expect(within(full).getByText('Opens a pull request.')).toBeInTheDocument();
    expect(within(full).getByText('crossed here')).toBeInTheDocument();
    expect(within(full).getByText('Run commands.')).toBeInTheDocument();
    expect(within(partial).getByRole('heading', { name: 'How the attack goes' })).toBeInTheDocument();
    expect(within(partial).queryByRole('heading', { name: 'Where it crosses' })).not.toBeInTheDocument();
    expect(within(partial).queryByRole('heading', { name: 'What an attacker can do' })).not.toBeInTheDocument();
  });

  test('shows plain text only for a finding without a visual', () => {
    // given
    const file = findingsFile([finding()]);
    // when
    render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    for (const name of ['How the attack goes', 'Where it crosses', 'What an attacker can do']) {
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
            { actor: '**bold**', step },
            { actor: 'the app', step: '[link](https://x.test)' },
          ],
          map: { zones: ['<b>out</b>', 'in'], from: '<b>out</b>', to: 'in' },
          reach: { now: ['<script>x</script>'], afterFix: [] },
        },
      }),
    ]);
    // when
    const { container } = render(<FindingsView tabId="t1" file={file} error={null} />);
    // then
    for (const text of [step, '**bold**', '[link](https://x.test)', '<b>out</b>', '<script>x</script>']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});
