const tails = new Map<string, Promise<unknown>>();

export function queueFindings<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (tails.get(key) ?? Promise.resolve()).then(run, run);
  const tail = next.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) {
      tails.delete(key);
    }
  });
  return next;
}
