export function parentEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_CHILD_SESSION;
  return env;
}
