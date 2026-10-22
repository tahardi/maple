export type Fetched<T> = { data: T | null; error: string | null; fetchedAt: string | null };
export type PreflightProblem = {
  tool: 'claude' | 'gh' | 'git' | 'tmux' | 'gh-auth' | 'jira-env' | 'claude-trust' | 'claude-sandbox';
  message: string;
};
export type Unsubscribe = () => void;
