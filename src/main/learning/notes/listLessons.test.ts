import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { listLessons } from './listLessons';

describe('listLessons', () => {
  let vault = '';

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'maple-lessons-'));
    mkdirSync(join(vault, 'Learning', 'Security', 'nested'), { recursive: true });
    writeFileSync(join(vault, 'Inbox.md'), '# Inbox\n');
    writeFileSync(join(vault, 'Learning', 'Security', 'xss.md'), '---\nstatus: learned\n---\n# Cross-site scripting\n');
    writeFileSync(join(vault, 'Learning', 'Security', 'sqli.md'), '# SQL injection\n');
    writeFileSync(join(vault, 'Learning', 'Security', 'csrf.md'), '---\nstatus: [x\n---\n# CSRF\n');
    writeFileSync(join(vault, 'Learning', 'Security', 'Upper.md'), '# Upper\n');
    writeFileSync(join(vault, 'Learning', 'Security', 'nested', 'deep.md'), '# Deep\n');
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  test('lists only notes under Learning/Security in a temp vault', async () => {
    // given
    const dir = vault;
    // when
    const got = await listLessons(dir);
    // then
    expect(got.map((l) => [l.path, l.status, l.title, l.error === null])).toEqual([
      ['Learning/Security/csrf.md', 'to-learn', 'CSRF', false],
      ['Learning/Security/sqli.md', 'to-learn', 'SQL injection', true],
      ['Learning/Security/xss.md', 'learned', 'Cross-site scripting', true],
    ]);
  });

  test('lists nothing when the lesson folder is missing', async () => {
    // given
    rmSync(join(vault, 'Learning'), { recursive: true });
    // when
    const got = await listLessons(vault);
    // then
    expect(got).toEqual([]);
  });
});
