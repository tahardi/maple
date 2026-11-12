import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DecisionInput } from '@shared/types/findings/decisionInput';
import type { Severity } from '@shared/types/findings/severity';
import { fakeMaple } from '@renderer/testing/fakeMaple';
import { finding } from '@renderer/testing/findingsFixture';
import { DecisionButtons } from './DecisionButtons';

function fakeFindings() {
  const decide = vi.fn<(tabId: string, id: string, decision: DecisionInput | null) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const override = vi.fn<(tabId: string, id: string, severity: Severity | null) => Promise<void>>(() =>
    Promise.resolve(),
  );
  fakeMaple({ findings: { decide, override } });
  return { decide, override };
}

const applied = { at: '2026-11-12T12:30:00.000Z', commit: 'abc1234', cardKey: null };

describe('DecisionButtons', () => {
  test.each<{ label: string; decision: DecisionInput }>([
    { label: 'Fix now', decision: { kind: 'fix-now', reason: null } },
    { label: 'Fix later', decision: { kind: 'fix-later', reason: null } },
    { label: 'Not real', decision: { kind: 'not-real', reason: null } },
    { label: 'Accept risk', decision: { kind: 'accept-risk', reason: 'Only Taylor runs it' } },
  ])('$label calls decide', async ({ label, decision }) => {
    // given
    const { decide } = fakeFindings();
    render(<DecisionButtons tabId="t1" finding={finding()} working={false} applying={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: label }));
    if (decision.kind === 'accept-risk') {
      const dialog = screen.getByRole('dialog', { name: 'Accept risk' });
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Only Taylor runs it');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Accept risk' }));
    }
    // then
    expect(decide).toHaveBeenCalledWith('t1', 'F1', decision);
  });

  test('clicking the chosen decision clears it', async () => {
    // given
    const { decide } = fakeFindings();
    const decided = finding({ decision: { kind: 'fix-later', reason: null, decidedAt: '2026-11-12T12:00:00.000Z' } });
    render(<DecisionButtons tabId="t1" finding={decided} working={false} applying={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Fix later' }));
    // then
    expect(decide).toHaveBeenCalledWith('t1', 'F1', null);
  });

  test('shows the chosen decision as pressed with its reason', () => {
    // given
    fakeFindings();
    const decision = { kind: 'accept-risk' as const, reason: 'Only Taylor runs it', decidedAt: '2026-11-12T12:00:00Z' };
    // when
    render(<DecisionButtons tabId="t1" finding={finding({ decision })} working={false} applying={false} />);
    // then
    expect(screen.getByRole('button', { name: 'Accept risk' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fix now' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Reason: Only Taylor runs it')).toBeInTheDocument();
  });

  test.each([
    { name: 'working', props: { working: true, applying: false }, given: finding(), reason: 'Claude is working' },
    { name: 'applied', props: { working: false, applying: false }, given: finding({ applied }), reason: 'Applied' },
    {
      name: 'applying',
      props: { working: false, applying: true },
      given: finding(),
      reason: 'Claude is applying your decisions',
    },
  ])('disables every control and shows the reason when $name', ({ props, given, reason }) => {
    // given
    fakeFindings();
    // when
    render(<DecisionButtons tabId="t1" finding={given} {...props} />);
    // then
    expect(screen.getByText(reason)).toBeInTheDocument();
    for (const label of ['Fix now', 'Fix later', 'Accept risk', 'Not real']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
    expect(screen.getByRole('combobox', { name: 'Severity' })).toBeDisabled();
  });

  test.each<{ option: string; severity: Severity | null }>([
    { option: 'low', severity: 'low' },
    { option: 'As reported', severity: null },
  ])('choosing $option calls override', async ({ option, severity }) => {
    // given
    const { override } = fakeFindings();
    render(
      <DecisionButtons tabId="t1" finding={finding({ severityOverride: 'medium' })} working={false} applying={false} />,
    );
    // when
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Severity' }), option);
    // then
    expect(override).toHaveBeenCalledWith('t1', 'F1', severity);
  });

  test('a decision waiting on IPC shows busy and blocks the others', async () => {
    // given
    fakeMaple({ findings: { decide: vi.fn(() => new Promise<void>(() => undefined)) } });
    render(<DecisionButtons tabId="t1" finding={finding()} working={false} applying={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Fix now' }));
    // then
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Not real' })).toBeDisabled();
  });

  test('a failed decision shows its error', async () => {
    // given
    const error = "Error invoking remote method 'findings:decide': Error: deciding finding: Claude is working";
    fakeMaple({ findings: { decide: vi.fn(() => Promise.reject(new Error(error))) } });
    render(<DecisionButtons tabId="t1" finding={finding()} working={false} applying={false} />);
    // when
    await userEvent.click(screen.getByRole('button', { name: 'Fix now' }));
    // then
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('deciding finding: Claude is working');
    });
  });
});
