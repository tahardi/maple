import type { QueueState } from '@shared/types/queue/queueState';

const WAITING_FOR: Record<'cpu' | 'memory', string> = { cpu: 'CPU', memory: 'memory' };

function gapText(seconds: number): string {
  if (seconds === 60) {
    return 'minute';
  }
  if (seconds % 60 === 0) {
    return `${String(seconds / 60)} minutes`;
  }
  return `${String(seconds)} seconds`;
}

export function waitText(queue: QueueState): string | null {
  const { waitingFor, working, limit, gapSeconds } = queue;
  if (waitingFor === null) {
    return null;
  }
  if (waitingFor === 'room') {
    return `Waiting for room: ${String(working)} of ${String(limit)} working`;
  }
  if (waitingFor === 'pace') {
    return `Starting one more every ${gapText(gapSeconds)}: ${String(working)} working`;
  }
  return `Waiting for ${WAITING_FOR[waitingFor]}: ${String(working)} working`;
}
