import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { delimiter, join } from 'node:path';

const fixtures = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'baseline');
export const token = 'secret-token-123';

export type Result = { code: number | null; stdout: string; stderr: string };

export function runScript(name: string, args: readonly string[], env: Record<string, string>): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(import.meta.dirname, name), ...args], {
      env: { ...process.env, PATH: [join(fixtures, 'bin'), process.env.PATH].join(delimiter), ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export function serveJira(status: number, pageSize = 100): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (status !== 200 || !req.url?.startsWith('/rest/api/3/search/jql')) {
        res.writeHead(status === 200 ? 404 : status).end();
        return;
      }
      const start = Number(new URL(req.url, 'http://x').searchParams.get('nextPageToken') ?? 0);
      void readFile(join(fixtures, 'jira-search.json'), 'utf8').then((text) => {
        const { issues } = JSON.parse(text) as { issues: unknown[] };
        const next = start + pageSize;
        const page = { issues: issues.slice(start, next), isLast: next >= issues.length, nextPageToken: String(next) };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(page));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

export async function writeEnv(path: string, server: Server): Promise<void> {
  const { port } = server.address() as AddressInfo;
  await writeFile(path, `JIRA_SITE=http://127.0.0.1:${String(port)}\nJIRA_EMAIL=me@example.com\nJIRA_TOKEN=${token}\n`);
}
