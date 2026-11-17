import { describe, expect, test } from 'vitest';
import { queueFindings } from './queueFindings';

function gate(): { wait: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

describe('queueFindings', () => {
  test('runs calls for one card in order', async () => {
    // given
    const order: string[] = [];
    const first = gate();
    // when
    const a = queueFindings('MPL-1', async () => {
      await first.wait;
      order.push('a');
    });
    const b = queueFindings('MPL-1', () => {
      order.push('b');
      return Promise.resolve();
    });
    first.open();
    await Promise.all([a, b]);
    // then
    expect(order).toEqual(['a', 'b']);
  });

  test('a failed call gives the caller its error and does not block the next one', async () => {
    // given
    const failed = queueFindings('MPL-2', () => Promise.reject(new Error('saving findings: MPL-2.json: EACCES')));
    // when
    const next = queueFindings('MPL-2', () => Promise.resolve('saved'));
    // then
    await expect(failed).rejects.toThrow('saving findings: MPL-2.json: EACCES');
    await expect(next).resolves.toBe('saved');
  });

  test('calls for different cards do not wait on each other', async () => {
    // given
    const stuck = gate();
    void queueFindings('MPL-3', () => stuck.wait);
    // when
    const other = queueFindings('MPL-4', () => Promise.resolve('done'));
    // then
    await expect(other).resolves.toBe('done');
    stuck.open();
  });
});
