import { describe, expect, test } from 'vitest';
import { expandHome } from '../../src/main/config';
import { JiraClient, readCreds } from '../../src/main/jira';

const statuses = ['To Do', 'In Progress', 'In Review', 'Done'];

describe('jira', () => {
  test('fetches the active MPL sprint and a known card', async () => {
    // given
    const creds = await readCreds(expandHome(process.env.MAPLE_JIRA_ENV ?? '~/.config/jira/env'));
    const client = new JiraClient(creds);
    // when
    const sprint = await client.activeSprint(9);
    const card = await client.getCard('MPL-6');
    // then
    expect(sprint).not.toBeNull();
    for (const c of sprint?.cards ?? []) {
      expect(statuses).toContain(c.status);
      expect(c.url.startsWith(creds.site)).toBe(true);
    }
    expect(card.status).toBe('Done');
    expect(card.summary).toBe('Repo Bootstrap');
  });
});
