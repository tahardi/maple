import { describe, expect, test, vi } from 'vitest';
import { askDeleteToday } from './askDeleteToday';

describe('askDeleteToday', () => {
  test.each([
    { name: 'keeping', response: 0, want: false },
    { name: 'deleting', response: 1, want: true },
  ])('answers $want when Taylor picks $name', async ({ response, want }) => {
    // given
    const show = vi.fn(() => Promise.resolve({ response }));

    // when
    const answer = await askDeleteToday(show, 1024 * 1024);

    // then
    expect(answer).toBe(want);
  });

  test('warns with the size and makes keeping the safe choice', async () => {
    // given
    const show = vi.fn(() => Promise.resolve({ response: 0 }));

    // when
    await askDeleteToday(show, 201 * 1024 * 1024);

    // then
    expect(show).toHaveBeenCalledWith({
      type: 'warning',
      title: 'Event log over its size limit',
      message: "Today's event log is over its size limit",
      detail:
        "Today's event log is 201 MB, over the eventMaxMegabytes limit in config.json. " +
        'Keep adding to it, or delete it and start fresh?',
      buttons: ['Keep adding to it', "Delete today's log"],
      defaultId: 0,
      cancelId: 0,
    });
  });
});
