export function cardPrompt(key: string): string {
  return `/card ${key}`;
}

export function SUGGEST_PROMPT(jiraKey: string): string {
  return `Which To Do cards in the active ${jiraKey} sprint can I start in parallel right now? Consider Blocks links, the parallelizable label, needs-taylor cards, and what is already In Progress or In Review. Give one line of reasoning per card. End your answer with exactly one line in this format and nothing after it: MAPLE-BATCH: KEY-1, KEY-2 (or MAPLE-BATCH: none).`;
}

export function secondReadPrompt(num: number): string {
  return `Review pull request ${String(num)} as a careful second reader. Read the change with \`gh pr diff ${String(num)}\` and open the files you need in this worktree. Look for bugs, missed edge cases, and code that does not match the rest of the repo. Do not edit files, commit, push, or comment on the PR. List each finding with its file path relative to the repo root and its line numbers in the current file. End your answer with exactly one line in this format and nothing after it: MAPLE-FINDINGS: <JSON array of {"path","line","text"}> (or MAPLE-FINDINGS: []).`;
}

export function fillAction(prompt: string, { key, pr }: { key: string; pr: number | null }): string {
  return prompt.replaceAll('{key}', key).replaceAll('{pr}', pr === null ? '' : String(pr));
}

export const APPROVE_COMMENT = 'LGTM';
