import type { z } from 'zod';
import type { Lesson } from '@shared/types/learning/lesson';
import type { LessonFinding } from '@shared/types/learning/lessonFinding';
import { summarizeLesson } from '@main/learning/notes/summarizeLesson';
import { quizSchema, type QuizKey } from './quizSchema';
import { traceSchema } from './traceSchema';

type Block = { tag: string; lines: string[] };

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ENTRY = /^(\d{4}-\d{2}-\d{2}) ([A-Z][A-Z0-9]*-\d+) F\d+: (.+)$/;
const TAGS = ['maple-trace', 'maple-quiz'];

function scan(text: string): { sections: Map<string, string[]>; blocks: Block[] } {
  const sections = new Map<string, string[]>();
  const blocks: Block[] = [];
  let h2 = '';
  let h3 = '';
  let fence: { mark: string; block: Block | null } | null = null;
  const add = (line: string) => {
    const key = `${h2}\n${h3}`;
    sections.set(key, [...(sections.get(key) ?? []), line]);
  };
  for (const line of text.split(/\r?\n/)) {
    const marker = FENCE.exec(line);
    if (fence !== null) {
      const closes =
        marker !== null &&
        marker[1][0] === fence.mark[0] &&
        marker[1].length >= fence.mark.length &&
        marker[2].trim() === '';
      if (closes) {
        fence = null;
      } else {
        fence.block?.lines.push(line);
      }
      add(line);
      continue;
    }
    if (marker !== null) {
      const tag = marker[2].trim();
      const block = TAGS.includes(tag) ? { tag, lines: [] } : null;
      if (block !== null) {
        blocks.push(block);
      }
      fence = { mark: marker[1], block };
      add(line);
      continue;
    }
    const heading = /^(#{1,3}) (.+?)\s*$/.exec(line);
    if (heading === null) {
      add(line);
    } else if (heading[1] === '###') {
      h3 = heading[2];
    } else {
      h2 = heading[1] === '##' ? heading[2] : '';
      h3 = '';
    }
  }
  return { sections, blocks };
}

function joined(lines: readonly string[] | undefined): string | null {
  const text = (lines ?? []).join('\n').trim();
  return text === '' ? null : text;
}

function issueText(issue: z.core.$ZodIssue): string {
  return issue.path.length === 0 ? issue.message : `${issue.path.map(String).join('.')}: ${issue.message}`;
}

function readBlock<T>(blocks: readonly Block[], tag: string, schema: z.ZodType<T>): { data: T } | { error: string } {
  const found = blocks.filter((b) => b.tag === tag);
  if (found.length !== 1) {
    return { error: `found ${String(found.length)} ${tag} blocks, want 1` };
  }
  let json: unknown;
  try {
    json = JSON.parse(found[0].lines.join('\n'));
  } catch {
    return { error: 'the block is not valid JSON' };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { data: parsed.data } : { error: issueText(parsed.error.issues[0]) };
}

function findings(sections: Map<string, string[]>): LessonFinding[] {
  return [...sections].flatMap(([key, lines]) => {
    const [h2, h3] = key.split('\n');
    const entry = h2 === 'Findings' ? ENTRY.exec(h3) : null;
    if (entry === null) {
      return [];
    }
    const pr = lines.map((line) => /^- PR: (.+)$/.exec(line)?.[1].trim()).find((url) => url !== undefined);
    return [
      {
        date: entry[1],
        card: entry[2],
        title: entry[3],
        pr: pr === undefined || pr === 'none yet' ? null : pr,
        tieIn: joined(lines.filter((line) => !/^- (PR|Code): /.test(line))),
      },
    ];
  });
}

export function parseLesson(path: string, text: string): { lesson: Lesson; key: QuizKey | null } {
  const summary = summarizeLesson(path, text);
  if (!summary.hasLesson) {
    throw new Error(`reading lesson: ${path} is not a lesson note`);
  }
  const { sections, blocks } = scan(text);
  const trace = readBlock(blocks, 'maple-trace', traceSchema);
  const quiz = readBlock(blocks, 'maple-quiz', quizSchema);
  const key = 'data' in quiz ? quiz.data : null;
  return {
    lesson: {
      summary,
      explanation: joined(sections.get('Lesson\nWhat it is')),
      attack: joined(sections.get('Lesson\nHow an attack works')),
      trace: 'data' in trace ? trace.data : null,
      traceError: 'error' in trace ? `reading lesson: trace: ${trace.error}` : null,
      quiz: key === null ? null : key.questions.map(({ question, choices }) => ({ question, choices })),
      quizError: 'error' in quiz ? `reading lesson: quiz: ${quiz.error}` : null,
      findings: findings(sections),
    },
    key,
  };
}
