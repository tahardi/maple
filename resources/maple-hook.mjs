import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const AGENT_TASK_TYPES = new Set(['subagent', 'workflow']);

function countAgents(tasks) {
  return Array.isArray(tasks) ? tasks.filter((task) => AGENT_TASK_TYPES.has(task?.type)).length : 0;
}

function targetPath(vault, toolInput) {
  const { file_path: filePath, path } = toolInput;
  if (typeof filePath === 'string') {
    return resolve(vault, filePath);
  }
  if (typeof path === 'string') {
    return resolve(vault, extname(path) === '' ? `${path}.md` : path);
  }
  return null;
}

function isInside(root, full) {
  const inside = relative(root, full);
  return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
}

function readNote(vault, target) {
  try {
    const real = realpathSync(target);
    return isInside(realpathSync(vault), real) ? readFileSync(real, 'utf8') : null;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return '';
    }
    throw err;
  }
}

function saveCopy(input) {
  const vault = process.env.MAPLE_VAULT_DIR;
  const snapshots = process.env.MAPLE_SNAPSHOT_DIR;
  if (!vault || !snapshots) {
    return;
  }
  const target = targetPath(vault, JSON.parse(input).tool_input ?? {});
  if (target === null || !isInside(vault, target) || extname(target) !== '.md') {
    return;
  }
  const text = readNote(vault, target);
  if (text === null) {
    return;
  }
  const copy = join(snapshots, relative(vault, target));
  mkdirSync(dirname(copy), { recursive: true });
  writeFileSync(copy, text, { flag: 'wx' });
}

setTimeout(() => process.exit(0), 900);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  if (process.argv[2] === 'PreToolUse') {
    try {
      saveCopy(input);
    } finally {
      process.exit(0);
    }
  }
  let notificationType = null;
  let backgroundAgents = 0;
  try {
    const payload = JSON.parse(input);
    notificationType = payload.notification_type ?? null;
    backgroundAgents = countAgents(payload.background_tasks);
  } catch {
    notificationType = null;
  }
  const line = JSON.stringify({
    tabId: process.env.MAPLE_TAB_ID ?? '',
    event: process.argv[2],
    notificationType,
    backgroundAgents,
  });
  const socket = connect(process.env.MAPLE_SOCKET ?? '', () => {
    socket.end(`${line}\n`, () => process.exit(0));
  });
  socket.on('error', () => process.exit(0));
});
