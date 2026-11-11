export type QueuedCard = { projectKey: string; cardKey: string };
export type WaitReason = 'room' | 'cpu' | 'memory';
export type QueueState = {
  cards: QueuedCard[];
  working: number;
  limit: number;
  waitingFor: WaitReason | null;
  failure: string | null;
};
