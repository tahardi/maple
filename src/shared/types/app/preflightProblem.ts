export type PreflightProblem = {
  tool: 'claude' | 'gh' | 'git' | 'tmux' | 'gh-auth' | 'jira-env' | 'claude-trust' | 'claude-sandbox';
  message: string;
};
