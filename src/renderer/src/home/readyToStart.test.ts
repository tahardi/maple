import { card } from '../testing/sprintFixture';
import { readyToStart } from './readyToStart';

describe('readyToStart', () => {
  test.each([
    { name: 'a To Do card with no blockers is ready', c: card('DIG-1', 'To Do'), open: [], want: ['DIG-1'] },
    {
      name: 'a To Do card with a blocker In Review is not ready',
      c: card('DIG-1', 'To Do', { blockedBy: [{ key: 'DIG-2', status: 'In Review' }] }),
      open: [],
      want: [],
    },
    {
      name: 'a To Do card whose blockers are all Done is ready',
      c: card('DIG-1', 'To Do', {
        blockedBy: [
          { key: 'DIG-2', status: 'Done' },
          { key: 'DIG-3', status: 'Done' },
        ],
      }),
      open: [],
      want: ['DIG-1'],
    },
    { name: 'an In Progress card is not ready', c: card('DIG-1', 'In Progress'), open: [], want: [] },
    {
      name: 'a needs-taylor card is not ready',
      c: card('DIG-1', 'To Do', { labels: ['needs-taylor'] }),
      open: [],
      want: [],
    },
    { name: 'a card with an open tab is not ready', c: card('DIG-1', 'To Do'), open: ['DIG-1'], want: [] },
  ])('$name', ({ c, open, want }) => {
    // given
    const cards = [card('DIG-0', 'To Do'), c];
    // when
    const ready = readyToStart(cards, new Set(open));
    // then
    expect(ready).toEqual(['DIG-0', ...want]);
  });
});
