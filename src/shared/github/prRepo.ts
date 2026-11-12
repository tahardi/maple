export function prRepo(url: string): string {
  return url.split('/').slice(3, 5).join('/');
}
