import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { isInside } from '@main/app/paths';
import { projectsDir, transcriptFiles } from '@main/sessions/transcripts';

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const NOTE_TOOL = 'mcp__anchorhold__anchorhold_write_note';

const toolUse = z.object({ type: z.literal('tool_use'), name: z.string(), input: z.record(z.string(), z.unknown()) });

const assistantLine = z.object({
  type: z.literal('assistant'),
  message: z.object({ content: z.array(z.unknown()) }),
});

function notePath(vaultDir: string, name: string, input: Record<string, unknown>): string | null {
  const raw = FILE_TOOLS.has(name) ? input.file_path : name === NOTE_TOOL ? input.path : null;
  if (typeof raw !== 'string' || !raw.endsWith('.md')) {
    return null;
  }
  const full = resolve(vaultDir, raw);
  return isInside(vaultDir, full) ? relative(vaultDir, full) : null;
}

export async function vaultWrites(
  sessionId: string,
  vaultDir: string,
  root: string = projectsDir(),
): Promise<string[]> {
  const files = await transcriptFiles(sessionId, root);
  const paths = new Set<string>();
  for (const file of files ?? []) {
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const parsed = assistantLine.safeParse(raw);
      for (const block of parsed.success ? parsed.data.message.content : []) {
        const use = toolUse.safeParse(block);
        const path = use.success ? notePath(vaultDir, use.data.name, use.data.input) : null;
        if (path !== null) {
          paths.add(path);
        }
      }
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}
