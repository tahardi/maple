import type { IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config';
import type { PrInfo } from '@shared/types/github';
import type { Runner as CommandRunner } from '@main/app/preflight';
import type { SessionManager } from '@main/sessions/sessions';
import type { StatusEngine } from '@main/sessions/status';
import type { Terminals } from '@main/sessions/terminals';
import { registerPr } from './pr';

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const {
  handle,
  prForBranch,
  commentOnPr,
  commentOnLine,
  replyToComment,
  resolveThread,
  reviewComments,
  diffLines,
  headCommit,
  gh,
  ghRunner,
  reviewFiles,
  reviewFilePair,
  openFindings,
  ghLogin,
  currentBranch,
  changedSince,
} = vi.hoisted(() => ({
  handle: vi.fn<(channel: string, handler: Handler) => void>(),
  prForBranch: vi.fn(),
  commentOnPr: vi.fn(),
  commentOnLine: vi.fn(),
  replyToComment: vi.fn(),
  resolveThread: vi.fn(),
  reviewComments: vi.fn(),
  diffLines: vi.fn(),
  headCommit: vi.fn(),
  gh: vi.fn<CommandRunner>(),
  ghRunner: vi.fn(),
  reviewFiles: vi.fn(),
  reviewFilePair: vi.fn(),
  openFindings: vi.fn(),
  ghLogin: vi.fn(),
  currentBranch: vi.fn(),
  changedSince: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('@main/git/git', () => ({ currentBranch, changedSince }));
vi.mock('@main/github/pr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@main/github/pr')>()),
  prForBranch,
  commentOnPr,
  diffLines,
  headCommit,
}));
vi.mock('@main/github/comments', () => ({ commentOnLine, replyToComment, resolveThread, reviewComments }));
vi.mock('@main/github/ghRunner', () => ({ ghRunner }));
vi.mock('@main/github/reviewDiff', () => ({ reviewFiles, reviewFilePair }));
vi.mock('@main/github/securityFindings', () => ({ openFindings, ghLogin }));

const event = {} as IpcMainInvokeEvent;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const pr: PrInfo = {
  number: 33,
  url: 'https://github.com/tahardi/maple/pull/33',
  title: '[MPL-13] GitHub Client',
  state: 'OPEN',
  deviations: 'None',
  needsTaylor: null,
  cardImpacts: null,
  body: '',
  checks: { passed: 1, failed: 0, pending: 0, total: 1, runs: [] },
};

const project: ProjectConfig = {
  name: 'Dig Days',
  jiraKey: 'DIG',
  jiraBoardId: 1,
  plannerDir: '/tmp/dig',
  repo: 'tahardi/dig-days',
};
const head = 'a'.repeat(40);
const base = 'c'.repeat(40);

function tabSessions(cardKey: string | null = 'DIG-44', projectKey = 'DIG', sendPrompt = vi.fn()) {
  return { get: () => ({ projectKey, cardKey }), sendPrompt } as unknown as SessionManager;
}

function register(
  channel: string,
  worktree: string | null,
  sessions: SessionManager = tabSessions(),
): (...args: unknown[]) => Promise<unknown> {
  registerPr(
    {
      window: () => null,
      worktreeFor: () => worktree,
      project: (key) => Promise.resolve(key === project.jiraKey ? project : null),
      sessions,
      terminals: {} as Terminals,
      status: {} as StatusEngine,
      setActiveTab: () => undefined,
      warnings: () => [],
      setNotifications: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      setLastProject: () => Promise.resolve(),
      lastProject: () => Promise.resolve(null),
    },
    logger,
  );
  const call = handle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`finding handler for ${channel}`);
  }
  return (...args) => call[1](event, ...args);
}

function get(worktree: string | null): (...args: unknown[]) => Promise<unknown> {
  return register('pr:get', worktree);
}

type Reply = { code: number; stdout: string; stderr: string };

const ok = (stdout = ''): Reply => ({ code: 0, stdout, stderr: '' });

function approver(
  answers: Record<string, Reply> = {},
  worktree: string | null = '/wt',
  cardKey: string | null = 'DIG-44',
) {
  const calls: string[] = [];
  gh.mockImplementation((_cmd, args) => {
    const key = args.join(' ');
    calls.push(key);
    return Promise.resolve(answers[key] ?? ok());
  });
  const sendPrompt = vi.fn(() => {
    calls.push('prompt');
  });
  const sessions = tabSessions(cardKey, 'DIG', sendPrompt);
  return { approve: register('pr:approve', worktree, sessions), sendPrompt, calls };
}

const viewHead = 'pr view 33 --json headRefOid --jq .headRefOid';
const postReview = `api --method POST repos/{owner}/{repo}/pulls/33/reviews -f event=APPROVE -f commit_id=${head}`;
const merge = `pr merge 33 --squash --match-head-commit ${head}`;

describe('registerPr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prForBranch.mockReset();
    currentBranch.mockReset().mockResolvedValue('mpl-13-github-client');
    ghRunner.mockReset().mockReturnValue(gh);
  });

  test('get looks up the PR for the tab worktree branch', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const prGet = get('/wt');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: pr, error: null, fetchedAt: expect.any(String) as string });
    expect(currentBranch).toHaveBeenCalledWith('/wt');
    expect(prForBranch).toHaveBeenCalledWith(gh, '/wt', 'mpl-13-github-client');
  });

  test('get keeps the last good PR and its fetchedAt when a later lookup fails', async () => {
    // given
    prForBranch.mockResolvedValueOnce(pr).mockRejectedValueOnce(new Error('listing PRs: offline'));
    const prGet = get('/wt');
    const first = (await prGet('t1')) as { fetchedAt: string };
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: pr, error: 'listing PRs: offline', fetchedAt: first.fetchedAt });
  });

  test.each([
    { name: 'the PR lookup', fail: () => prForBranch.mockRejectedValue(new Error('listing PRs: offline')) },
    { name: 'the branch lookup', fail: () => currentBranch.mockRejectedValue(new Error('listing PRs: offline')) },
  ])('get returns the error with no data when $name fails with nothing cached', async ({ fail }) => {
    // given
    fail();
    const prGet = get('/wt');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: null, error: 'listing PRs: offline', fetchedAt: null });
  });

  test('get never serves one tab the cached PR of another tab', async () => {
    // given
    prForBranch.mockResolvedValueOnce(pr).mockRejectedValueOnce(new Error('listing PRs: offline'));
    const prGet = get('/wt');
    await prGet('t1');
    // when
    const result = await prGet('t2');
    // then
    expect(result).toEqual({ data: null, error: 'listing PRs: offline', fetchedAt: null });
  });

  test('get clears the error once a lookup succeeds again', async () => {
    // given
    prForBranch.mockRejectedValueOnce(new Error('listing PRs: offline')).mockResolvedValueOnce(pr);
    const prGet = get('/wt');
    await prGet('t1');
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: pr, error: null, fetchedAt: expect.any(String) as string });
  });

  test('get returns no PR when the tab has no worktree', async () => {
    // given
    const prGet = get(null);
    // when
    const result = await prGet('t1');
    // then
    expect(result).toEqual({ data: null, error: null, fetchedAt: null });
    expect(prForBranch).not.toHaveBeenCalled();
  });

  test('pr:approve approves and merges the pinned commit, then prompts /card', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve, sendPrompt, calls } = approver({ [viewHead]: ok(`${head}\n`) });
    // when
    await approve('t1', head);
    // then
    expect(calls).toEqual([viewHead, postReview, merge, 'prompt']);
    expect(sendPrompt).toHaveBeenCalledWith('t1', '/card DIG-44');
    expect(ghRunner).toHaveBeenCalledWith('tahardi/dig-days');
    expect(ghRunner.mock.calls.every(([repo]) => repo === 'tahardi/dig-days')).toBe(true);
    expect(prForBranch).toHaveBeenCalledWith(gh, '/wt', 'mpl-13-github-client');
    expect(commentOnPr).not.toHaveBeenCalled();
  });

  test('pr:approve refuses when the head moved', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve, sendPrompt, calls } = approver({ [viewHead]: ok(`${'d'.repeat(40)}\n`) });
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(/^approving PR: the PR changed after the diff loaded; review it again$/);
    expect(calls).toEqual([viewHead]);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('pr:approve reports a failed review', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve, sendPrompt, calls } = approver({
      [viewHead]: ok(`${head}\n`),
      [postReview]: { code: 1, stdout: '', stderr: 'HTTP 422' },
    });
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(/^approving PR: reviewing: HTTP 422$/);
    expect(calls).toEqual([viewHead, postReview]);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('pr:approve reports a failed merge', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve, sendPrompt } = approver({
      [viewHead]: ok(`${head}\n`),
      [merge]: { code: 1, stdout: '', stderr: 'Head branch was modified' },
    });
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(/^approving PR: merging: Head branch was modified$/);
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:approve',
      tabId: 't1',
      error: 'approving PR: merging: Head branch was modified',
    });
  });

  test.each([
    { name: 'a short sha', sha: 'abc123' },
    { name: 'an upper-case sha', sha: 'A'.repeat(40) },
    { name: 'no sha', sha: undefined },
  ])('pr:approve rejects $name', ({ sha }) => {
    // given
    const { approve, calls } = approver();
    // when
    const result = () => approve('t1', sha);
    // then
    expect(result).toThrow('handling pr:approve: arguments are invalid');
    expect(calls).toEqual([]);
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, cardKey: 'DIG-44', want: 'tab has no card worktree' },
    { name: 'the tab has no card', worktree: '/wt', cardKey: null, want: 'tab has no card worktree' },
  ])('pr:approve rejects and calls nothing when $name', async ({ worktree, cardKey, want }) => {
    // given
    prForBranch.mockResolvedValue(pr);
    const { approve, sendPrompt, calls } = approver({}, worktree, cardKey);
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(`approving PR: ${want}`);
    expect(prForBranch).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'there is no PR', found: null },
    { name: 'the PR is merged', found: { ...pr, state: 'MERGED' as const } },
    { name: 'the PR is closed', found: { ...pr, state: 'CLOSED' as const } },
  ])('pr:approve rejects and calls nothing when $name', async ({ found }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const { approve, sendPrompt, calls } = approver();
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow('approving PR: branch has no open PR');
    expect(calls).toEqual([]);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('pr:approve rejects with the cause when the PR lookup fails', async () => {
    // given
    prForBranch.mockRejectedValue(new Error('listing PRs: offline'));
    const { approve, sendPrompt } = approver();
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(/^approving PR: listing PRs: offline$/);
    expect(sendPrompt).not.toHaveBeenCalled();
  });

  test('pr:approve rejects when the tab project has no repo', async () => {
    // given
    const sessions = tabSessions('DIG-44', 'HALO');
    const approve = register('pr:approve', '/wt', sessions);
    // when
    const result = approve('t1', head);
    // then
    await expect(result).rejects.toThrow(/^approving PR: finding project repo: unknown project HALO$/);
    expect(ghRunner).not.toHaveBeenCalled();
  });

  test('pr:review returns files and open findings for the open PR', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const files = [{ path: 'src/a.ts', status: 'M', oldPath: null, stamp: 'f'.repeat(40) }];
    reviewFiles.mockResolvedValue({ number: 33, headSha: head, baseSha: base, files });
    const findings = [{ id: 'F1', severity: 'high', summary: 'Token logged', url: 'https://github.com/x' }];
    openFindings.mockResolvedValue(findings);
    ghLogin.mockResolvedValue('tahardi');
    const review = register('pr:review', '/wt');
    // when
    const result = await review('t1');
    await review('t1');
    // then
    expect(result).toEqual({
      data: { number: 33, headSha: head, baseSha: base, files, findings },
      error: null,
      fetchedAt: expect.any(String) as string,
    });
    expect(reviewFiles).toHaveBeenCalledWith(gh, 33);
    expect(openFindings).toHaveBeenCalledWith(gh, 33, 'tahardi');
    expect(ghLogin).toHaveBeenCalledTimes(1);
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, found: pr },
    { name: 'the branch has no PR', worktree: '/wt', found: null },
    { name: 'the PR is merged', worktree: '/wt', found: { ...pr, state: 'MERGED' as const } },
  ])('pr:review returns no review when $name', async ({ worktree, found }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const review = register('pr:review', worktree);
    // when
    const result = await review('t1');
    // then
    expect(result).toEqual({ data: null, error: null, fetchedAt: null });
    expect(reviewFiles).not.toHaveBeenCalled();
  });

  test('pr:review returns and logs the error when the fetch fails', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    reviewFiles.mockRejectedValue(new Error('fetching review: the PR head moved, try again'));
    openFindings.mockResolvedValue([]);
    ghLogin.mockResolvedValue('tahardi');
    const review = register('pr:review', '/wt');
    // when
    const result = await review('t1');
    // then
    const error = 'fetching review: the PR head moved, try again';
    expect(result).toEqual({ data: null, error, fetchedAt: null });
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', { operation: 'pr:review', tabId: 't1', error });
  });

  test('pr:review asks for the gh login again after a failed lookup', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    reviewFiles.mockResolvedValue({ number: 33, headSha: head, baseSha: base, files: [] });
    openFindings.mockResolvedValue([]);
    ghLogin.mockRejectedValueOnce(new Error('reading gh login: offline')).mockResolvedValue('tahardi');
    const review = register('pr:review', '/wt');
    const first = await review('t1');
    // when
    const second = await review('t1');
    // then
    expect(first).toEqual({ data: null, error: 'reading gh login: offline', fetchedAt: null });
    expect(second).toMatchObject({ data: { headSha: head, findings: [] }, error: null });
  });

  test('pr:review returns no review when the findings cannot be listed', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    reviewFiles.mockResolvedValue({ number: 33, headSha: head, baseSha: base, files: [] });
    openFindings.mockRejectedValue(new Error('listing findings: offline'));
    ghLogin.mockResolvedValue('tahardi');
    const review = register('pr:review', '/wt');
    // when
    const result = await review('t1');
    // then
    expect(result).toEqual({ data: null, error: 'listing findings: offline', fetchedAt: null });
  });

  test('pr:readFile logs and rethrows a failed read', async () => {
    // given
    reviewFilePair.mockRejectedValue(new Error('fetching review: HTTP 502'));
    const readFile = register('pr:readFile', '/wt');
    // when
    const result = readFile('t1', 'src/a.ts', null, base, head);
    // then
    await expect(result).rejects.toThrow('fetching review: HTTP 502');
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:readFile',
      tabId: 't1',
      path: 'src/a.ts',
      error: 'fetching review: HTTP 502',
    });
  });

  test('pr:readFile reads from GitHub at the given commits', async () => {
    // given
    const pair = { kind: 'text', path: 'src/a.ts', base: 'old\n', current: 'new\n' };
    reviewFilePair.mockResolvedValue(pair);
    const readFile = register('pr:readFile', '/wt');
    // when
    const result = await readFile('t1', 'src/a.ts', 'src/old.ts', base, head);
    // then
    expect(result).toEqual(pair);
    expect(reviewFilePair).toHaveBeenCalledWith(gh, 'src/a.ts', 'src/old.ts', base, head);
    expect(ghRunner).toHaveBeenCalledWith('tahardi/dig-days');
  });

  test.each([
    { name: 'a bad base sha', path: 'src/a.ts', baseSha: 'main', headSha: head },
    { name: 'a bad head sha', path: 'src/a.ts', baseSha: base, headSha: 'HEAD' },
    { name: 'an empty path', path: '', baseSha: base, headSha: head },
    { name: 'a path that is too long', path: 'a'.repeat(4097), baseSha: base, headSha: head },
  ])('pr:readFile rejects $name', ({ path, baseSha, headSha }) => {
    // given
    const readFile = register('pr:readFile', '/wt');
    // when
    const result = () => readFile('t1', path, null, baseSha, headSha);
    // then
    expect(result).toThrow('handling pr:readFile: arguments are invalid');
    expect(reviewFilePair).not.toHaveBeenCalled();
  });

  test('comment posts the line comment on the open PR', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const comment = register('pr:comment', '/wt');
    // when
    await comment('t1', 'src/a.ts', null, 3, 'why?');
    // then
    expect(commentOnLine).toHaveBeenCalledWith(gh, '/wt', 33, {
      path: 'src/a.ts',
      startLine: null,
      line: 3,
      body: 'why?',
    });
  });

  test.each([
    {
      name: 'the PR is merged',
      worktree: '/wt',
      found: { ...pr, state: 'MERGED' as const },
      want: 'branch has no open PR',
    },
    { name: 'there is no PR', worktree: '/wt', found: null, want: 'branch has no open PR' },
    { name: 'the tab has no worktree', worktree: null, found: pr, want: 'tab has no card worktree' },
  ])('comment rejects and posts nothing when $name', async ({ worktree, found, want }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const comment = register('pr:comment', worktree);
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?');
    // then
    await expect(result).rejects.toThrow(`commenting on line: ${want}`);
    expect(commentOnLine).not.toHaveBeenCalled();
  });

  test('comment rejects with the one prefix and logs the path and line when the post fails', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    commentOnLine.mockRejectedValueOnce(new Error('commenting on line: line must be part of the diff'));
    const comment = register('pr:comment', '/wt');
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?');
    // then
    await expect(result).rejects.toThrow(/^commenting on line: line must be part of the diff$/);
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:comment',
      tabId: 't1',
      path: 'src/a.ts',
      startLine: null,
      line: 3,
      error: 'commenting on line: line must be part of the diff',
    });
  });

  test('comment posts on a range of lines', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const comment = register('pr:comment', '/wt');
    // when
    await comment('t1', 'src/a.ts', 1, 3, 'why?');
    // then
    expect(commentOnLine).toHaveBeenCalledWith(gh, '/wt', 33, {
      path: 'src/a.ts',
      startLine: 1,
      line: 3,
      body: 'why?',
    });
  });

  test('reply posts on the open PR of the worktree branch', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const reply = register('pr:reply', '/wt');
    // when
    await reply('t1', 101, 'thanks');
    // then
    expect(replyToComment).toHaveBeenCalledWith(gh, '/wt', 33, 101, 'thanks');
  });

  test.each([
    {
      name: 'the PR is merged',
      worktree: '/wt',
      found: { ...pr, state: 'MERGED' as const },
      want: 'branch has no open PR',
    },
    { name: 'there is no PR', worktree: '/wt', found: null, want: 'branch has no open PR' },
    { name: 'the tab has no worktree', worktree: null, found: pr, want: 'tab has no card worktree' },
  ])('reply rejects and posts nothing when $name', async ({ worktree, found, want }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const reply = register('pr:reply', worktree);
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow(`replying to comment: ${want}`);
    expect(replyToComment).not.toHaveBeenCalled();
  });

  test('reply rejects with the one prefix when the PR lookup fails', async () => {
    // given
    prForBranch.mockRejectedValueOnce(new Error('listing PRs: offline'));
    const reply = register('pr:reply', '/wt');
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow(/^replying to comment: listing PRs: offline$/);
    expect(replyToComment).not.toHaveBeenCalled();
  });

  test('reply logs the comment id when the post fails', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    replyToComment.mockRejectedValueOnce(new Error('replying to comment: not found'));
    const reply = register('pr:reply', '/wt');
    // when
    const result = reply('t1', 101, 'thanks');
    // then
    await expect(result).rejects.toThrow(/^replying to comment: not found$/);
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:reply',
      tabId: 't1',
      commentId: 101,
      error: 'replying to comment: not found',
    });
  });

  test('resolve resolves the thread from the tab worktree', async () => {
    // given
    const resolve = register('pr:resolve', '/wt');
    // when
    await resolve('t1', 'PRRT_101', true);
    // then
    expect(resolveThread).toHaveBeenCalledWith(gh, '/wt', 'PRRT_101', true);
  });

  test('resolve unresolves the thread from the tab worktree', async () => {
    // given
    const resolve = register('pr:resolve', '/wt');
    // when
    await resolve('t1', 'PRRT_101', false);
    // then
    expect(resolveThread).toHaveBeenCalledWith(gh, '/wt', 'PRRT_101', false);
  });

  test('resolve rejects and resolves nothing when the tab has no worktree', async () => {
    // given
    const resolve = register('pr:resolve', null);
    // when
    const result = resolve('t1', 'PRRT_101', true);
    // then
    await expect(result).rejects.toThrow('resolving thread: tab has no card worktree');
    expect(resolveThread).not.toHaveBeenCalled();
  });

  test('resolve logs the thread id when it fails', async () => {
    // given
    resolveThread.mockRejectedValueOnce(new Error('resolving thread: not found'));
    const resolve = register('pr:resolve', '/wt');
    // when
    const result = resolve('t1', 'PRRT_101', true);
    // then
    await expect(result).rejects.toThrow(/^resolving thread: not found$/);
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:resolve',
      tabId: 't1',
      threadId: 'PRRT_101',
      resolved: true,
      error: 'resolving thread: not found',
    });
  });

  test('diffLines returns the PR diff ranges and the files that differ from the PR head', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    diffLines.mockResolvedValue({ 'src/a.ts': [[1, 4]] });
    headCommit.mockResolvedValue('abc123');
    changedSince.mockResolvedValue(['src/b.ts']);
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = await lines('t1');
    // then
    expect(result).toEqual({ ranges: { 'src/a.ts': [[1, 4]] }, unpushed: ['src/b.ts'] });
    expect(diffLines).toHaveBeenCalledWith(gh, '/wt', 33);
    expect(headCommit).toHaveBeenCalledWith(gh, '/wt', 33);
    expect(changedSince).toHaveBeenCalledWith('/wt', 'abc123');
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, found: pr },
    { name: 'the branch has no PR', worktree: '/wt', found: null },
  ])('diffLines returns none when $name', async ({ worktree, found }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const lines = register('pr:diffLines', worktree);
    // when
    const result = await lines('t1');
    // then
    expect(result).toEqual({ ranges: {}, unpushed: [] });
    expect(diffLines).not.toHaveBeenCalled();
  });

  test('comment rejects with the one prefix when the PR lookup fails', async () => {
    // given
    prForBranch.mockRejectedValueOnce(new Error('listing PRs: offline'));
    const comment = register('pr:comment', '/wt');
    // when
    const result = comment('t1', 'src/a.ts', null, 3, 'why?');
    // then
    await expect(result).rejects.toThrow(/^commenting on line: listing PRs: offline$/);
    expect(commentOnLine).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'the PR head lookup',
      fail: () => headCommit.mockRejectedValueOnce(new Error('reading PR head: offline')),
      error: 'reading PR head: offline',
    },
    {
      name: 'the unpushed files lookup',
      fail: () => changedSince.mockRejectedValueOnce(new Error('running git diff --name-only -z abc123: bad object')),
      error: 'running git diff --name-only -z abc123: bad object',
    },
  ])('logs a failed diffLines at warn and rejects when $name fails', async ({ fail, error }) => {
    // given
    prForBranch.mockResolvedValue(pr);
    diffLines.mockResolvedValue({});
    headCommit.mockResolvedValue('abc123');
    changedSince.mockResolvedValue([]);
    fail();
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = lines('t1');
    // then
    await expect(result).rejects.toThrow(error);
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', { operation: 'pr:diffLines', tabId: 't1', error });
  });

  test('logs a failed diffLines lookup at warn and rejects', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    diffLines.mockRejectedValueOnce(new Error('listing PR files: offline'));
    headCommit.mockResolvedValue('abc123');
    const lines = register('pr:diffLines', '/wt');
    // when
    const result = lines('t1');
    // then
    await expect(result).rejects.toThrow('listing PR files: offline');
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:diffLines',
      tabId: 't1',
      error: 'listing PR files: offline',
    });
  });

  test('comments lists the review comments on the PR', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    const found = [{ path: 'src/a.ts', line: 3, author: 'tahardi', body: 'why?' }];
    reviewComments.mockResolvedValue(found);
    const comments = register('pr:comments', '/wt');
    // when
    const result = await comments('t1');
    // then
    expect(result).toEqual(found);
    expect(reviewComments).toHaveBeenCalledWith(gh, '/wt', 33);
  });

  test.each([
    { name: 'the tab has no worktree', worktree: null, found: pr },
    { name: 'the branch has no PR', worktree: '/wt', found: null },
  ])('comments returns none when $name', async ({ worktree, found }) => {
    // given
    prForBranch.mockResolvedValue(found);
    const comments = register('pr:comments', worktree);
    // when
    const result = await comments('t1');
    // then
    expect(result).toEqual([]);
    expect(reviewComments).not.toHaveBeenCalled();
  });

  test('logs a failed comments lookup at warn and rejects', async () => {
    // given
    prForBranch.mockResolvedValue(pr);
    reviewComments.mockRejectedValue(new Error('listing review comments: offline'));
    const comments = register('pr:comments', '/wt');
    // when
    const result = comments('t1');
    // then
    await expect(result).rejects.toThrow('listing review comments: offline');
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:comments',
      tabId: 't1',
      error: 'listing review comments: offline',
    });
  });

  test('logs a failed PR lookup at warn', async () => {
    // given
    prForBranch.mockRejectedValue(new Error('listing PRs: offline'));
    const prGet = get('/wt');
    // when
    await prGet('t1');
    // then
    expect(logger.warn).toHaveBeenCalledWith('gh', 'failed', {
      operation: 'pr:get',
      tabId: 't1',
      error: 'listing PRs: offline',
    });
  });
});
