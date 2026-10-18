import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer/src'),
};

const copyResources: Plugin = {
  name: 'copy-resources',
  generateBundle() {
    for (const fileName of readdirSync('resources').filter((name) => !name.endsWith('.test.ts'))) {
      this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve('resources', fileName)) });
    }
  },
};

export default defineConfig({
  main: { resolve: { alias }, plugins: [copyResources] },
  preload: { resolve: { alias } },
  renderer: { resolve: { alias }, plugins: [react()] },
});
