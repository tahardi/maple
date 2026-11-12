import { approveConfirm } from './approveConfirm';

describe('approveConfirm', () => {
  test.each([
    { name: 'nothing open', highFindings: 0, unviewed: 0, body: 'Approves PR #149 and merges it.', danger: false },
    { name: 'one finding', highFindings: 1, unviewed: 0, body: '1 open high-severity finding.', danger: true },
    { name: 'two findings', highFindings: 2, unviewed: 0, body: '2 open high-severity findings.', danger: true },
    { name: 'one unviewed', highFindings: 0, unviewed: 1, body: '1 changed file not viewed.', danger: true },
    { name: 'two unviewed', highFindings: 0, unviewed: 2, body: '2 changed files not viewed.', danger: true },
    {
      name: 'both',
      highFindings: 1,
      unviewed: 2,
      body: '1 open high-severity finding. 2 changed files not viewed.',
      danger: true,
    },
  ])('$name', ({ highFindings, unviewed, body, danger }) => {
    // when
    const confirm = approveConfirm({ number: 149, highFindings, unviewed });
    // then
    expect(confirm).toEqual({ title: 'Approve & merge PR #149?', body, danger });
  });
});
