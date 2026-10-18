import type { FileChange, FileStatus } from '@shared/types';

export type TreeNode = { name: string; path: string; dir: boolean; status: FileStatus | null; children: TreeNode[] };

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) => ({ ...node, children: sortTree(node.children) }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

export function buildTree(paths: readonly string[], changes: readonly FileChange[], changedOnly: boolean): TreeNode[] {
  const status = new Map(changes.map((c) => [c.path, c.status]));
  const files = new Set(changedOnly ? status.keys() : [...paths, ...status.keys()]);
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode[]>([['', root]]);
  for (const file of files) {
    const parts = file.split('/');
    let siblings = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join('/');
      let children = dirs.get(path);
      if (!children) {
        children = [];
        dirs.set(path, children);
        siblings.push({ name: parts[i], path, dir: true, status: null, children });
      }
      siblings = children;
    }
    siblings.push({
      name: parts[parts.length - 1],
      path: file,
      dir: false,
      status: status.get(file) ?? null,
      children: [],
    });
  }
  return sortTree(root);
}
