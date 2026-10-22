export function cardPrompt(key: string): string {
  return `/card ${key}`;
}

export function suggestPrompt(jiraKey: string): string {
  return `Which To Do cards in the active ${jiraKey} sprint can I start in parallel right now? Consider Blocks links, the parallelizable label, needs-taylor cards, and what is already In Progress or In Review. Give one line of reasoning per card. If no To Do card in the active ${jiraKey} sprint can start, suggest instead which To Do cards in the ${jiraKey} backlog to pull into the sprint, using the same rules, and put those keys in the batch line. End your answer with exactly one line in this format and nothing after it: MAPLE-BATCH: KEY-1, KEY-2 (or MAPLE-BATCH: none).`;
}

export function fillAction(prompt: string, { key, pr }: { key: string; pr: number | null }): string {
  return prompt.replaceAll('{key}', key).replaceAll('{pr}', pr === null ? '' : String(pr));
}

export const APPROVE_COMMENT = 'LGTM';
