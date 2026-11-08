import { open, type FileHandle } from 'node:fs/promises';

export async function closeTornLine(path: string): Promise<void> {
  let file: FileHandle;
  try {
    file = await open(path, 'r+');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return;
    }
    throw err;
  }
  try {
    const { size } = await file.stat();
    if (size === 0) {
      return;
    }
    const { buffer } = await file.read(Buffer.alloc(1), 0, 1, size - 1);
    if (buffer.toString() !== '\n') {
      await file.write('\n', size);
    }
  } finally {
    await file.close();
  }
}
