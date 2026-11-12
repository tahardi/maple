const TOKEN_SHAPES = /\b(?:gh[po]_[A-Za-z0-9]+|github_pat_\w+|sk-ant-[\w-]+)/g;

const AUTH_SCHEMES = /\b(Basic|Bearer) [A-Za-z0-9+/=._~-]+/g;

export function scrubSecrets(text: string, secrets: readonly string[]): string {
  const given = secrets.filter((s) => s !== '');
  const encoded = given.flatMap((a) =>
    given.filter((b) => b !== a).map((b) => Buffer.from(`${a}:${b}`).toString('base64')),
  );
  let scrubbed = text;
  for (const secret of [...encoded, ...given]) {
    scrubbed = scrubbed.replaceAll(secret, '[redacted]');
  }
  return scrubbed.replace(TOKEN_SHAPES, '[redacted]').replace(AUTH_SCHEMES, '$1 [redacted]');
}
