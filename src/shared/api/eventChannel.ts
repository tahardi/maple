export function eventChannel(area: string, method: string, keys: readonly unknown[]): string {
  const event = method.charAt(2).toLowerCase() + method.slice(3);
  return [area, event, ...keys.map(String)].join(':');
}
