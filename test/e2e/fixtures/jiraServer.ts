import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const fixtures = join(import.meta.dirname, '../../fixtures/jira');

const routes: readonly { pattern: RegExp; file: string }[] = [
  { pattern: /^\/rest\/agile\/1\.0\/board\/\d+\/sprint\?state=active$/, file: 'board-sprint-active.json' },
  { pattern: /^\/rest\/api\/3\/search\/jql\?/, file: 'sprint-issues.json' },
  { pattern: /^\/rest\/api\/3\/issue\/[A-Z]+-\d+\?/, file: 'issue.json' },
];

export type JiraServer = { url: string; requests: readonly string[]; close: () => Promise<void> };

export async function startJiraServer(): Promise<JiraServer> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${new Date().toISOString()} ${req.method ?? ''} ${req.url ?? ''}`);
    const route = routes.find((r) => r.pattern.test(req.url ?? ''));
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    void readFile(join(fixtures, route.file)).then((body) => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('starting jira server: address is not a socket');
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
