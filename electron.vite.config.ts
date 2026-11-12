import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const alias = {
  '@main': resolve('src/main'),
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer/src'),
};

const copyResources: Plugin = {
  name: 'copy-resources',
  generateBundle() {
    const files = readdirSync('resources', { withFileTypes: true }).filter(
      (entry) => entry.isFile() && !entry.name.endsWith('.test.ts'),
    );
    for (const { name: fileName } of files) {
      this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve('resources', fileName)) });
    }
  },
};

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return 'unknown';
  }
}

const stampBuild: Plugin = {
  name: 'stamp-build',
  generateBundle() {
    const source = JSON.stringify({ sha: gitSha(), date: new Date().toISOString() });
    this.emitFile({ type: 'asset', fileName: 'build.json', source });
  },
};

export default defineConfig({
  main: { resolve: { alias }, plugins: [copyResources, stampBuild] },
  preload: {
    resolve: { alias },
    build: { rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: { resolve: { alias }, plugins: [react()] },
});
