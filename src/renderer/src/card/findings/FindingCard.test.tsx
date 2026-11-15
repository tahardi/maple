import { render, screen, within } from '@testing-library/react';
import type { Finding } from '@shared/types/findings/finding';
import { useMaple } from '@renderer/store';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { finding, glance } from '@renderer/testing/findingsFixture';
import { FindingCard } from './FindingCard';

function show(given: Finding) {
  render(<FindingCard tabId="t1" finding={given} working={false} applying={false} lessons={[]} />);
}

function fact(term: string): string | null {
  const dt = screen.queryByText(term, { selector: 'dt' });
  return dt?.nextElementSibling?.textContent ?? null;
}

describe('FindingCard', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
    fakeMaple();
  });

  test.each([
    { name: 'the headline', given: finding(glance), want: glance.headline },
    { name: 'the title when there is none', given: finding(), want: 'Branch name reaches a shell' },
  ])('leads with $name', ({ given, want }) => {
    // given
    // when
    show(given);
    // then
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(want);
  });

  test('shows only the facts it has', () => {
    // given
    const given = finding({ attacker: glance.attacker, fixSize: 'large' });
    // when
    show(given);
    // then
    expect(fact('Who can do it')).toBe('anyone who can push a branch');
    expect(fact('Likely?')).toBeNull();
    expect(fact('Fix size')).toBe('Large');
    expect(fact('Where')).toBe('src/main/x.ts:42');
  });

  test('shows every fact when the finding has them all', () => {
    // given
    // when
    show(finding(glance));
    // then
    expect(fact('Likely?')).toBe('Possible');
    expect(fact('Fix size')).toBe('Small');
  });

  test.each([
    { name: 'with a recommendation', given: finding(glance), primary: ['Fix now'], line: 'Recommended: Fix now.' },
    { name: 'without one', given: finding(), primary: [], line: null },
  ])('draws the recommended decision as primary and shows why $name', ({ given, primary, line }) => {
    // given
    // when
    show(given);
    // then
    const drawn = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-variant') === 'primary')
      .map((b) => b.textContent);
    expect(drawn).toEqual(primary);
    if (line === null) {
      expect(screen.queryByText(/Recommended:/)).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(line)).toBeInTheDocument();
      expect(screen.getByText(glance.recommend.why)).toBeInTheDocument();
    }
  });

  test('folds the four sections under Full write-up', () => {
    // given
    // when
    const { container } = render(
      <FindingCard tabId="t1" finding={finding()} working={false} applying={false} lessons={[]} />,
    );
    // then
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    const folded = within(details as HTMLElement);
    expect(folded.getByText('Full write-up', { selector: 'summary' })).toBeInTheDocument();
    for (const [label, text] of [
      ['What it is', 'A branch name is put into a shell command.'],
      ['How someone uses it', 'Someone who names a branch can run commands.'],
      ['What it means here', 'They could read the Jira token.'],
      ['How to defend', 'Pass arguments as an array.'],
    ]) {
      expect(folded.getByText(label)).toBeInTheDocument();
      expect(folded.getByText(text)).toBeInTheDocument();
    }
  });
});
