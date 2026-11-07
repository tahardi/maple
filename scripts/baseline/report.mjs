import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PRICES = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

const HOURS = (v) => v.toFixed(1);
const COUNT = (v) => String(Math.round(v * 10) / 10);
const DOLLARS = (v) => v.toFixed(2);

const COLUMNS = [
  ['Card', null],
  ['Summary', null],
  ['In Progress h', HOURS],
  ['In Review h', HOURS],
  ['To Done h', HOURS],
  ['PR', null],
  ['PR Open to Merge h', HOURS],
  ['Commits After Open', COUNT],
  ['Sync Merges', COUNT],
  ['Review Rounds', COUNT],
  ['Review Comments', COUNT],
  ['CI Runs', COUNT],
  ['CI Failures', COUNT],
  ['Review Min', HOURS],
  ['Claude $', DOLLARS],
  ['Hand Min', COUNT],
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function time(text) {
  return Date.parse(text.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

function hours(ms) {
  return ms / 3_600_000;
}

function statusHours(card) {
  const moves = card.changelog.histories
    .flatMap((h) => h.items.filter((i) => i.field === 'status').map((i) => ({ at: time(h.created), to: i.toString })))
    .sort((a, b) => a.at - b.at);
  const spent = (status) =>
    moves.some((m) => m.to === status)
      ? hours(moves.reduce((sum, m, i) => (m.to === status && moves[i + 1] ? sum + moves[i + 1].at - m.at : sum), 0))
      : null;
  const start = moves.find((m) => m.to === 'In Progress');
  const done = moves.findLast((m) => m.to === 'Done');
  return {
    'In Progress h': spent('In Progress'),
    'In Review h': spent('In Review'),
    'To Done h': start && done ? hours(done.at - start.at) : null,
  };
}

function isSyncMerge(message) {
  return message.startsWith('Merge') && /\bmain\b/.test(message);
}

function isClaudeReply(body) {
  return (body ?? '').startsWith('**Claude:**');
}

function prCounts(gh, reviewer) {
  const opened = time(gh.pr.createdAt);
  const commits = gh.timeline.filter((e) => e.event === 'committed');
  const comments = gh.comments.filter((c) => c.user?.login === reviewer && !isClaudeReply(c.body));
  const reviews = gh.reviews.filter(
    (r) =>
      r.user?.login === reviewer &&
      !isClaudeReply(r.body) &&
      (r.body || r.state !== 'COMMENTED' || comments.some((c) => c.pull_request_review_id === r.id)),
  );
  const runs = gh.runs.filter((r) => r.event === 'pull_request');
  const reviewMs = reviews.reduce((sum, review) => {
    const times = comments.filter((c) => c.pull_request_review_id === review.id).map((c) => time(c.created_at));
    return times.length ? sum + Math.max(0, time(review.submitted_at) - Math.min(...times)) : sum;
  }, 0);
  return {
    PR: String(gh.pr.number),
    'PR Open to Merge h': hours(time(gh.pr.mergedAt) - opened),
    'Commits After Open': commits.filter((c) => time(c.committer.date) > opened && !isSyncMerge(c.message)).length,
    'Sync Merges': commits.filter((c) => isSyncMerge(c.message)).length,
    'Review Rounds': reviews.length,
    'Review Comments': comments.length,
    'CI Runs': runs.length,
    'CI Failures': runs.filter((r) => r.conclusion === 'failure').length,
    'Review Min': reviewMs / 60_000,
  };
}

function firstUserText(lines) {
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== 'user') {
      continue;
    }
    const content = entry.message?.content;
    if (typeof content === 'string') {
      return content;
    }
    return Array.isArray(content) ? content.map((c) => c?.text ?? '').join('\n') : '';
  }
  return '';
}

function sessionDollars(files) {
  const seen = new Set();
  let dollars = 0;
  for (const file of files) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const message = entry?.message;
      const usage = message?.usage;
      if (
        entry.type !== 'assistant' ||
        typeof message.id !== 'string' ||
        typeof message.model !== 'string' ||
        typeof usage?.input_tokens !== 'number' ||
        typeof usage.output_tokens !== 'number' ||
        seen.has(message.id)
      ) {
        continue;
      }
      seen.add(message.id);
      const price = PRICES[message.model.replace(/-\d{8}$/, '')];
      if (!price) {
        return null;
      }
      const writes = usage.cache_creation_input_tokens ?? 0;
      const writes1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      dollars +=
        (usage.input_tokens * price.input +
          usage.output_tokens * price.output +
          writes1h * price.input * 2 +
          (writes - writes1h) * price.input * 1.25 +
          (usage.cache_read_input_tokens ?? 0) * price.cacheRead) /
        1e6;
    }
  }
  return dollars;
}

function cardDollars() {
  const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
  const byCard = new Map();
  if (!existsSync(root)) {
    return byCard;
  }
  for (const project of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dir = join(root, project.name);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
      const main = join(dir, file);
      const match = /<command-args>(MPL-\d+)\D/.exec(firstUserText(readFileSync(main, 'utf8').split('\n')));
      if (!match) {
        continue;
      }
      const subagents = join(dir, file.slice(0, -'.jsonl'.length), 'subagents');
      const files = existsSync(subagents)
        ? [
            main,
            ...readdirSync(subagents)
              .filter((f) => f.endsWith('.jsonl'))
              .map((f) => join(subagents, f)),
          ]
        : [main];
      const dollars = sessionDollars(files);
      const prior = byCard.has(match[1]) ? byCard.get(match[1]) : 0;
      byCard.set(match[1], prior === null || dollars === null ? null : prior + dollars);
    }
  }
  return byCard;
}

function handLogPath(args) {
  const flag = args.indexOf('--hand-log');
  if (flag !== -1) {
    return args[flag + 1] ?? fail('reading hand log: --hand-log needs a file');
  }
  const configDir = process.env.MAPLE_CONFIG_DIR ?? join(homedir(), '.config', 'maple');
  try {
    const { vaultDir } = readJson(join(configDir, 'config.json'));
    return typeof vaultDir === 'string'
      ? join(vaultDir.replace(/^~(?=$|\/)/, homedir()), 'Projects', 'Maple', 'Hand Log.md')
      : null;
  } catch {
    return null;
  }
}

function handMinutes(path) {
  const minutes = new Map();
  if (!path || !existsSync(path)) {
    return minutes;
  }
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\|\s*(MPL-\d+)\s*\|\s*(\d+(?:\.\d+)?)\s*\|/.exec(line);
    if (match) {
      minutes.set(match[1], (minutes.get(match[1]) ?? 0) + Number(match[2]));
    }
  }
  return minutes;
}

function median(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cell(value, format) {
  if (value === null || value === undefined) {
    return '';
  }
  return format && typeof value === 'number' ? format(value) : String(value).replaceAll('|', '\\|');
}

const args = process.argv.slice(2);
const dataDir = args[0] ?? fail('reading args: usage: report.mjs <dataDir> [--hand-log <file>]');
let cards;
let reviewer;
try {
  reviewer = readJson(join(dataDir, 'meta.json')).reviewer;
  cards = readdirSync(join(dataDir, 'jira'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(join(dataDir, 'jira', f)));
} catch (err) {
  fail(`reading data dir: ${err.message}`);
}

const dollars = cardDollars();
const hand = handMinutes(handLogPath(args));
const rows = cards
  .filter((card) => !card.fields.summary.startsWith('[TEST]'))
  .sort((a, b) => Number(a.key.split('-')[1]) - Number(b.key.split('-')[1]))
  .map((card) => {
    const ghPath = join(dataDir, 'gh', `${card.key}.json`);
    return {
      Card: card.key,
      Summary: card.fields.summary,
      ...statusHours(card),
      ...(existsSync(ghPath) ? prCounts(readJson(ghPath), reviewer) : {}),
      'Claude $': dollars.get(card.key) ?? null,
      'Hand Min': hand.get(card.key) ?? null,
    };
  });
const medians = Object.fromEntries(
  COLUMNS.map(([name, format]) => [name, format ? median(rows.map((r) => r[name])) : null]),
);
medians.Card = 'Median';

const line = (cells) => `| ${cells.join(' | ')} |`;
const out = [line(COLUMNS.map(([name]) => name)), line(COLUMNS.map(() => '---'))];
for (const row of [...rows, medians]) {
  out.push(line(COLUMNS.map(([name, format]) => cell(row[name], format))));
}
process.stdout.write(`${out.join('\n')}\n`);
