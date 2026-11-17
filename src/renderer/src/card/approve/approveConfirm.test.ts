import { approveConfirm } from './approveConfirm';

describe('approveConfirm', () => {
  test.each([
    { name: 'nothing open', undecided: 0, unviewed: 0, body: 'Approves PR #149 and merges it.', danger: false },
    { name: 'one undecided', undecided: 1, unviewed: 0, body: '1 finding not decided.', danger: true },
    { name: 'two undecided', undecided: 2, unviewed: 0, body: '2 findings not decided.', danger: true },
    { name: 'one unviewed', undecided: 0, unviewed: 1, body: '1 changed file not viewed.', danger: true },
    { name: 'two unviewed', undecided: 0, unviewed: 2, body: '2 changed files not viewed.', danger: true },
    {
      name: 'both',
      undecided: 1,
      unviewed: 2,
      body: '1 finding not decided. 2 changed files not viewed.',
      danger: true,
    },
  ])('$name', ({ undecided, unviewed, body, danger }) => {
    // given
    // when
    const confirm = approveConfirm({ number: 149, undecided, unviewed });
    // then
    expect(confirm).toEqual({ title: 'Approve & merge PR #149?', body, danger });
  });
});
