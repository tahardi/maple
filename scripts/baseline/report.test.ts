import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { sessionCost } from '../../src/main/sessions/sessionCost';
import { type Result, runScript, serveJira, writeEnv } from './scriptHarness';

type Row = Record<string, string>;

type GhData = { pr: Record<string, unknown> } & Record<
  'timeline' | 'reviews' | 'comments' | 'runs',
  Record<string, unknown>[]
>;

const usage = {
  input_tokens: 100_000,
  output_tokens: 200_000,
  cache_creation_input_tokens: 1_000_000,
  cache_read_input_tokens: 10_000_000,
  cache_creation: { ephemeral_5m_input_tokens: 400_000, ephemeral_1h_input_tokens: 600_000 },
};

function userLine(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}

function assistantLine(id: string, model = 'claude-sonnet-4-5'): string {
  return JSON.stringify({ type: 'assistant', message: { id, model, usage } });
}

function cardStart(args: string): string {
  return userLine(`<command-message>card</command-message>\n<command-name>/card</command-name>\n<command-args>${args}`);
}

function parseTable(stdout: string): Row[] {
  const lines = stdout.split('\n').filter((line) => line.startsWith('|'));
  const split = (line: string): string[] =>
    line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
  const header = split(lines[0]);
  return lines.slice(2).map((line) => Object.fromEntries(split(line).map((cell, i) => [header[i], cell])));
}

function rowFor(result: Result, card: string): Row {
  const row = parseTable(result.stdout).find((r) => r.Card === card);
  if (!row) {
    throw new Error(`finding row ${card} in:\n${result.stdout}\n${result.stderr}`);
  }
  return row;
}

describe('report.mjs', () => {
  let fetched = '';
  let dir = '';
  let dataDir = '';
  let claudeDir = '';
  let configDir = '';
  let project = '';

  beforeAll(async () => {
    fetched = await mkdtemp(join(tmpdir(), 'maple-baseline-fetched-'));
    const server = await serveJira(200);
    await writeEnv(join(fetched, 'env'), server);
    const result = await runScript('fetch.mjs', [join(fetched, 'data')], { MAPLE_JIRA_ENV: join(fetched, 'env') });
    server.close();
    if (result.code !== 0) {
      throw new Error(`running fetch.mjs: ${result.stderr}`);
    }
  });

  afterAll(async () => {
    await rm(fetched, { recursive: true, force: true });
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-baseline-report-'));
    dataDir = join(dir, 'data');
    claudeDir = join(dir, 'claude');
    configDir = join(dir, 'config');
    project = join(claudeDir, 'projects', '-home-x-maple');
    await mkdir(project, { recursive: true });
    await mkdir(configDir);
    await writeFile(join(configDir, 'config.json'), JSON.stringify({ vaultDir: join(dir, 'vault') }));
    await cp(join(fetched, 'data'), dataDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function report(...args: string[]): Promise<Result> {
    return runScript('report.mjs', [dataDir, ...args], { CLAUDE_CONFIG_DIR: claudeDir, MAPLE_CONFIG_DIR: configDir });
  }

  async function editGh(edit: (gh: GhData) => void): Promise<void> {
    const path = join(dataDir, 'gh', 'MPL-97.json');
    const gh = JSON.parse(await readFile(path, 'utf8')) as GhData;
    edit(gh);
    await writeFile(path, JSON.stringify(gh));
  }

  test('prints status hours from the changelog', async () => {
    // when
    const result = await report();
    // then
    expect(result.code).toBe(0);
    expect(rowFor(result, 'MPL-97')).toMatchObject({
      Summary: 'Inline New-Comment Form',
      'In Progress h': '0.1',
      'In Review h': '1.7',
      'In Progress to Done h': '1.8',
    });
  });

  test('prints PR counts from the timeline, reviews, comments, and runs', async () => {
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-97')).toMatchObject({
      PR: '76',
      'PR Open to Merge h': '1.7',
      'Commits After Open': '3',
      'Sync Merges': '2',
      'Review Rounds': '2',
      'Review Comments': '2',
      'CI Runs': '5',
      'CI Failures': '0',
    });
  });

  test('leaves status hours blank for a status the card never entered', async () => {
    // given
    const card = {
      key: 'MPL-998',
      fields: { summary: 'Straight to Done', created: '' },
      changelog: {
        histories: [
          {
            created: '2026-10-22T12:00:00.000-0400',
            items: [{ field: 'status', fromString: 'To Do', toString: 'Done' }],
          },
        ],
      },
    };
    await writeFile(join(dataDir, 'jira', 'MPL-998.json'), JSON.stringify(card));
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-998')).toMatchObject({
      'In Progress h': '',
      'In Review h': '',
      'In Progress to Done h': '',
    });
  });

  test('counts an approval with no comments as a round that adds no review minutes', async () => {
    // given
    await editGh((gh) => {
      gh.reviews.push({
        id: 1,
        user: { login: 'tahardi' },
        state: 'APPROVED',
        body: '',
        submitted_at: '2026-10-22T18:42:00Z',
      });
    });
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-97')).toMatchObject({
      'Review Rounds': '3',
      'Review Comments': '2',
      'Review Minutes': '0.0',
    });
  });

  test("counts Taylor's top-level PR comments as review rounds", async () => {
    // given
    await editGh((gh) => {
      gh.timeline.push(
        {
          event: 'commented',
          user: { login: 'tahardi' },
          body: 'Please rename this',
          created_at: '2026-10-22T18:30:00Z',
        },
        {
          event: 'commented',
          user: { login: 'tahardi' },
          body: '**Claude:** Renamed',
          created_at: '2026-10-22T18:31:00Z',
        },
        { event: 'commented', user: { login: 'someone' }, body: 'Nice', created_at: '2026-10-22T18:32:00Z' },
      );
    });
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-97')).toMatchObject({ 'Review Rounds': '3', 'Review Comments': '2' });
  });

  test('counts only pull_request runs and failed conclusions', async () => {
    // given
    await editGh((gh) => {
      gh.runs.push(
        { conclusion: 'failure', event: 'pull_request', createdAt: '2026-10-22T18:40:00Z' },
        { conclusion: 'failure', event: 'push', createdAt: '2026-10-22T18:41:00Z' },
      );
    });
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-97')).toMatchObject({ 'CI Runs': '6', 'CI Failures': '1' });
  });

  test('estimates review minutes from comment and review timestamps', async () => {
    // given
    await editGh((gh) => {
      gh.comments[0].created_at = '2026-10-22T18:10:51Z';
    });
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-97')['Review Minutes']).toBe('10.0');
  });

  test('leaves PR columns blank for a card with no merged PR', async () => {
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-6')).toMatchObject({ PR: '', 'Review Rounds': '', 'CI Runs': '' });
  });

  test('skips [TEST] hand-test cards', async () => {
    // given
    const card = { key: 'MPL-999', fields: { summary: '[TEST] Made up', created: '' }, changelog: { histories: [] } };
    await writeFile(join(dataDir, 'jira', 'MPL-999.json'), JSON.stringify(card));
    // when
    const result = await report();
    // then
    expect(parseTable(result.stdout).map((r) => r.Card)).toEqual(['MPL-6', 'MPL-97', 'Median']);
  });

  test('costs a card the same as sessionCost', async () => {
    // given
    await writeFile(
      join(project, 's1.jsonl'),
      [cardStart('MPL-97</command-args>'), assistantLine('msg_1'), assistantLine('msg_1')].join('\n') + '\n',
    );
    await mkdir(join(project, 's1', 'subagents'), { recursive: true });
    await writeFile(
      join(project, 's1', 'subagents', 'agent-a.jsonl'),
      assistantLine('msg_2', 'claude-opus-5-5') + '\n',
    );
    await writeFile(
      join(project, 's2.jsonl'),
      [cardStart('MPL-97 force</command-args>'), assistantLine('msg_3')].join('\n') + '\n',
    );
    await writeFile(
      join(project, 's3.jsonl'),
      [cardStart('MPL-970</command-args>'), assistantLine('msg_4')].join('\n') + '\n',
    );
    await writeFile(
      join(project, 's4.jsonl'),
      [userLine('look at MPL-97'), cardStart('MPL-97</command-args>'), assistantLine('msg_5')].join('\n') + '\n',
    );
    const root = join(claudeDir, 'projects');
    const costs = await Promise.all(['s1', 's2'].map((id) => sessionCost(id, root)));
    const want = costs.reduce((sum, cost) => sum + (cost?.dollars ?? Number.NaN), 0);
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-97')['Claude $']).toBe(want.toFixed(2));
    expect(rowFor(result, 'MPL-6')['Claude $']).toBe('');
  });

  test('leaves dollars blank when a transcript uses an unknown model', async () => {
    // given
    await writeFile(
      join(project, 's1.jsonl'),
      [cardStart('MPL-97</command-args>'), assistantLine('msg_1'), assistantLine('msg_2', 'claude-mystery-9')].join(
        '\n',
      ) + '\n',
    );
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'MPL-97')['Claude $']).toBe('');
  });

  test.each([
    { name: 'the vault hand log', where: 'vault', want: '25' },
    { name: 'a file passed with --hand-log', where: 'flag', want: '25' },
    { name: 'no hand log file', where: 'none', want: '' },
  ])('reads hand log minutes from $name', async ({ where, want }) => {
    // given
    const log = '# Hand Log\n\n| Card | Minutes |\n| --- | --- |\n| MPL-142 | 40 |\n| MPL-97 | 25 |\nnotes\n';
    const args: string[] = [];
    if (where === 'vault') {
      await mkdir(join(dir, 'vault', 'Projects', 'Maple'), { recursive: true });
      await writeFile(join(dir, 'vault', 'Projects', 'Maple', 'Hand Log.md'), log);
    }
    if (where === 'flag') {
      await writeFile(join(dir, 'hand.md'), log);
      args.push('--hand-log', join(dir, 'hand.md'));
    }
    // when
    const result = await report(...args);
    // then
    expect(result.code).toBe(0);
    expect(rowFor(result, 'MPL-97')['Hand Minutes']).toBe(want);
  });

  test('prints medians that skip blank cells', async () => {
    // when
    const result = await report();
    // then
    expect(rowFor(result, 'Median')).toMatchObject({
      'In Review h': '0.9',
      'PR Open to Merge h': '1.7',
      'Review Rounds': '2',
      'Claude $': '',
    });
  });

  test('warns and leaves PR columns blank when a gh file is broken', async () => {
    // given
    await writeFile(join(dataDir, 'gh', 'MPL-97.json'), '{not json');
    // when
    const result = await report();
    // then
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(`reading ${join(dataDir, 'gh', 'MPL-97.json')}: `);
    expect(rowFor(result, 'MPL-97')).toMatchObject({ PR: '', 'Review Rounds': '', 'In Review h': '1.7' });
  });

  test('warns and skips a card whose jira file is broken', async () => {
    // given
    await writeFile(join(dataDir, 'jira', 'MPL-5.json'), '{not json');
    // when
    const result = await report();
    // then
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(`reading ${join(dataDir, 'jira', 'MPL-5.json')}: `);
    expect(parseTable(result.stdout).map((r) => r.Card)).toEqual(['MPL-6', 'MPL-97', 'Median']);
  });

  test("warns and leaves dollars blank when a session's subagent transcript cannot be read", async () => {
    // given
    await writeFile(
      join(project, 's1.jsonl'),
      [cardStart('MPL-97</command-args>'), assistantLine('msg_1')].join('\n') + '\n',
    );
    await mkdir(join(project, 's1', 'subagents', 'agent-a.jsonl'), { recursive: true });
    await mkdir(join(project, 's2.jsonl'));
    // when
    const result = await report();
    // then
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(`reading ${join(project, 's1', 'subagents', 'agent-a.jsonl')}: `);
    expect(result.stderr).toContain(`reading ${join(project, 's2.jsonl')}: `);
    expect(rowFor(result, 'MPL-97')['Claude $']).toBe('');
  });

  test('exits 1 with "reading hand log: ..." when --hand-log has no file', async () => {
    // when
    const result = await report('--hand-log');
    // then
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^reading hand log: /);
  });

  test('exits 1 with "reading data dir: ..." when the dir is missing', async () => {
    // when
    const result = await runScript('report.mjs', [join(dir, 'missing')], { CLAUDE_CONFIG_DIR: claudeDir });
    // then
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^reading data dir: /);
  });
});
