import { describe, expect, test } from 'vitest';
import { expandHome } from '../../src/main/app/config';
import { JiraClient, readCreds } from '../../src/main/jira/jira';

const statuses = ['To Do', 'In Progress', 'In Review', 'Done'];

function creds() {
  return readCreds(expandHome(process.env.MAPLE_JIRA_ENV ?? '~/.config/jira/env'));
}

describe('jira', () => {
  test('fetches the active MPL sprint and a known card', async () => {
    // given
    const jira = await creds();
    const client = new JiraClient(jira);
    // when
    const sprint = await client.activeSprint(9);
    const card = await client.getCard('MPL-6');
    // then
    expect(sprint).not.toBeNull();
    expect(sprint?.name).not.toBe('');
    expect(Number.isNaN(Date.parse(sprint?.startDate ?? ''))).toBe(false);
    expect(Number.isNaN(Date.parse(sprint?.endDate ?? ''))).toBe(false);
    expect(sprint?.cards.length).toBeGreaterThan(0);
    for (const c of sprint?.cards ?? []) {
      expect(statuses).toContain(c.status);
      expect(c.url.startsWith(jira.site)).toBe(true);
    }
    expect(card.status).toBe('Done');
    expect(card.summary).toBe('Repo Bootstrap');
  });

  test('fetches the MPL backlog grouped by epic', async () => {
    // given
    const client = new JiraClient(await creds());
    // when
    const groups = await client.backlog('MPL');
    // then
    expect(groups.length).toBeGreaterThan(0);
    for (const c of groups.flatMap((g) => g.cards)) {
      expect(c.status).not.toBe('Done');
    }
  });

  test('reads points, labels, blockers, and description from a card', async () => {
    // given
    const client = new JiraClient(await creds());
    // when
    const card = await client.getCard('MPL-31');
    // then
    expect(card.points).toBe(3);
    expect(card.labels).toContain('parallelizable');
    expect(card.blockedBy).toEqual(
      expect.arrayContaining([
        { key: 'MPL-11', status: 'Done' },
        { key: 'MPL-13', status: 'Done' },
        { key: 'MPL-14', status: 'Done' },
      ]),
    );
    expect(card.descriptionMd).toContain('make test-live');
  });

  test.each([
    {
      name: 'unknown card',
      call: async () => new JiraClient(await creds()).getCard('MPL-999999'),
      error: 'fetching card: Jira returned 404',
    },
    {
      name: 'bad token',
      call: async () => new JiraClient({ ...(await creds()), token: 'not-a-token' }).activeSprint(9),
      error: 'fetching sprint: Jira returned 401',
    },
  ])('rejects on $name', async ({ call, error }) => {
    // given
    // when
    const result = call();
    // then
    await expect(result).rejects.toThrow(error);
  });
});
