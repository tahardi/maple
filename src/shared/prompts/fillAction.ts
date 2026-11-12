export function fillAction(prompt: string, { key, pr }: { key: string; pr: number | null }): string {
  return prompt.replaceAll('{key}', key).replaceAll('{pr}', pr === null ? '' : String(pr));
}
