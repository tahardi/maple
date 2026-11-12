import { render, screen, within } from '@testing-library/react';
import { finding, findingsFile } from '@renderer/testing/findingsFixture';
import { FindingsView } from './FindingsView';

const decided = { kind: 'fix-later' as const, reason: null, decidedAt: '2026-11-12T12:00:00.000Z' };

describe('FindingsView', () => {
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
});
