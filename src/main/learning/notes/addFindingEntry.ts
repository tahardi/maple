import type { FindingIdentity } from '@shared/types/findings/findingIdentity';
import { lessonClass } from '@shared/learning/lessonClass';

export type FindingEntry = {
  key: string;
  id: string;
  identity: FindingIdentity;
  line: number | null;
  title: string;
  pr: string | null;
};

const TITLE_CHARS = 120;
const DATED = /^### \d{4}-\d{2}-\d{2} /;

function titleOf(slug: string): string {
  const words = slug.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function codeOf({ identity, line }: FindingEntry): string {
  const place =
    identity.kind === 'dependency'
      ? `${identity.package} ${identity.advisory}`
      : line === null
        ? identity.file
        : `${identity.file}:${String(line)}`;
  return place.replace(/[`\r\n]/g, '');
}

function newNote(slug: string): string {
  return (
    `---\nclass: ${slug}\nstatus: to-learn\ncomfortable: false\ngrades: []\n---\n` +
    `# ${titleOf(slug)}\n\n## Findings\n`
  );
}

export function addFindingEntry(text: string | null, entry: FindingEntry, date: string): string {
  const note = text ?? newNote(lessonClass(entry.identity));
  const lead = `${entry.key} ${entry.id}: `;
  const lines = note.split(/\r?\n/);
  if (lines.some((line) => DATED.test(line) && line.slice(15).startsWith(lead))) {
    return note;
  }
  const title = entry.title.replace(/\s+/g, ' ').trim().slice(0, TITLE_CHARS);
  const block = `### ${date} ${lead}${title}\n- PR: ${entry.pr ?? 'none yet'}\n- Code: \`${codeOf(entry)}\`\n`;
  const base = note.endsWith('\n') ? note : `${note}\n`;
  const findings = lines.some((line) => /^## Findings\s*$/.test(line)) ? '' : '\n## Findings\n';
  return `${base}${findings}\n${block}`;
}
