import type { MessageBoxOptions } from 'electron';

const DELETE_BUTTON = 1;

export async function askDeleteToday(
  show: (options: MessageBoxOptions) => Promise<{ response: number }>,
  bytes: number,
): Promise<boolean> {
  const megabytes = Math.round(bytes / (1024 * 1024));
  const { response } = await show({
    type: 'warning',
    title: 'Event log over its size limit',
    message: "Today's event log is over its size limit",
    detail:
      `Today's event log is ${String(megabytes)} MB, over the eventMaxMegabytes limit in config.json. ` +
      'Keep adding to it, or delete it and start fresh?',
    buttons: ['Keep adding to it', "Delete today's log"],
    defaultId: 0,
    cancelId: 0,
  });
  return response === DELETE_BUTTON;
}
