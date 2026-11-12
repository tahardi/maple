export type ActionRecorder = (channel: string, args: readonly unknown[]) => void;

let recorder: ActionRecorder = () => undefined;

export function recordActions(record: ActionRecorder): void {
  recorder = record;
}

export function recordAction(channel: string, args: readonly unknown[]): void {
  recorder(channel, args);
}
