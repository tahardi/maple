import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JQL = 'project = MPL AND status = Done AND issuetype != Epic';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readCreds(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    fail(`reading jira creds: ${err.message}`);
  }
  const env = new Map();
  for (const line of text.split('\n')) {
    const match = /^\s*(?:export\s+)?(\w+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) {
      env.set(match[1], match[2].replace(/^(['"])(.*)\1$/, '$2'));
    }
  }
  const get = (key) => env.get(key) || fail(`reading jira creds: ${key} is missing`);
  const site = get('JIRA_SITE').replace(/\/+$/, '');
  return {
    site: /^https?:\/\//.test(site) ? site : `https://${site}`,
    auth: `Basic ${Buffer.from(`${get('JIRA_EMAIL')}:${get('JIRA_TOKEN')}`).toString('base64')}`,
  };
}

async function fetchCards(creds) {
  const cards = [];
  let nextPageToken;
  do {
    const url = new URL(`${creds.site}/rest/api/3/search/jql`);
    url.searchParams.set('jql', JQL);
    url.searchParams.set('fields', 'summary,created');
    url.searchParams.set('expand', 'changelog');
    url.searchParams.set('maxResults', '100');
    if (nextPageToken) {
      url.searchParams.set('nextPageToken', nextPageToken);
    }
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: creds.auth, Accept: 'application/json' } });
    } catch (err) {
      fail(`fetching jira: ${err.message}`);
    }
    if (!res.ok) {
      fail(`fetching jira: ${String(res.status)}`);
    }
    const page = await res.json();
    cards.push(...page.issues);
    nextPageToken = page.isLast ? undefined : page.nextPageToken;
  } while (nextPageToken);
  return cards;
}

function gh(...args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) {
    fail(`running gh ${args.join(' ')}: ${(result.stderr || result.error?.message || '').trim()}`);
  }
  return result.stdout;
}

function ghJson(...args) {
  return JSON.parse(gh(...args));
}

function slurp(path) {
  return ghJson('api', '--paginate', '--slurp', path).flat();
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const outDir = process.argv[2] ?? fail('reading args: usage: fetch.mjs <outDir>');
const creds = readCreds(process.env.MAPLE_JIRA_ENV ?? join(homedir(), '.config', 'jira', 'env'));
const cards = await fetchCards(creds);
const prs = ghJson(
  'pr',
  'list',
  '--state',
  'merged',
  '--limit',
  '1000',
  '--json',
  'number,title,headRefName,createdAt,mergedAt',
);
const reviewer = gh('api', 'user', '--jq', '.login').trim();

mkdirSync(join(outDir, 'jira'), { recursive: true });
mkdirSync(join(outDir, 'gh'), { recursive: true });
for (const card of cards) {
  writeJson(join(outDir, 'jira', `${card.key}.json`), card);
  const n = card.key.split('-')[1];
  const pr = prs.find((p) => p.headRefName.startsWith(`mpl-${n}-`) || p.title.startsWith(`[MPL-${n}]`));
  if (!pr) {
    continue;
  }
  const base = `repos/{owner}/{repo}`;
  writeJson(join(outDir, 'gh', `${card.key}.json`), {
    pr,
    timeline: slurp(`${base}/issues/${String(pr.number)}/timeline`),
    reviews: slurp(`${base}/pulls/${String(pr.number)}/reviews`),
    comments: slurp(`${base}/pulls/${String(pr.number)}/comments`),
    runs: ghJson('run', 'list', '--branch', pr.headRefName, '--limit', '100', '--json', 'conclusion,event,createdAt'),
  });
}
writeJson(join(outDir, 'meta.json'), { fetchedAt: new Date().toISOString(), reviewer });
