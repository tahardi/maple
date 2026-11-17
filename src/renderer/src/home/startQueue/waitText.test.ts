import type { QueueState, WaitReason } from '@shared/types/queue/queueState';
import { waitText } from './waitText';

function queueOf(waitingFor: WaitReason | null, gapSeconds: number, limit = 8): QueueState {
  return {
    cards: [{ projectKey: 'DIG', cardKey: 'DIG-45' }],
    working: 6,
    limit,
    waitingFor,
    gapSeconds,
    failure: null,
  };
}

describe('waitText', () => {
  test.each([
    { name: 'room', queue: queueOf('room', 90, 6), text: 'Waiting for room: 6 of 6 working' },
    { name: 'cpu', queue: queueOf('cpu', 90), text: 'Waiting for CPU: 6 working' },
    { name: 'memory', queue: queueOf('memory', 90), text: 'Waiting for memory: 6 working' },
    { name: 'pace with gap 15', queue: queueOf('pace', 15), text: 'Starting one more every 15 seconds: 6 working' },
    { name: 'pace with gap 90', queue: queueOf('pace', 90), text: 'Starting one more every 90 seconds: 6 working' },
    { name: 'pace with gap 60', queue: queueOf('pace', 60), text: 'Starting one more every minute: 6 working' },
    { name: 'pace with gap 120', queue: queueOf('pace', 120), text: 'Starting one more every 2 minutes: 6 working' },
  ])('$name reads $text', ({ queue, text }) => {
    // given
    const given = queue;
    // when
    const result = waitText(given);
    // then
    expect(result).toBe(text);
  });

  test('no wait reads null', () => {
    // given
    const queue = queueOf(null, 90);
    // when
    const result = waitText(queue);
    // then
    expect(result).toBeNull();
  });
});
