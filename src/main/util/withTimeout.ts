export function withTimeout<T>(lookup: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timing out after ${String(ms / 1000)}s`));
    }, ms);
  });
  return Promise.race([lookup, expired]).finally(() => {
    clearTimeout(timer);
  });
}
