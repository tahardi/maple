import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

const SOCKET_TESTS = ['src/main/sessions/hookServer.test.ts', 'resources/maple-hook.test.ts'];

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    globals: true,
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'resources/*.test.ts'],
          exclude: [...configDefaults.exclude, 'test/live/**', ...SOCKET_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'socket',
          environment: 'node',
          include: SOCKET_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: 'live',
          environment: 'node',
          include: ['test/live/**/*.live.test.ts'],
          testTimeout: 180_000,
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          css: { include: [/\?raw$/] },
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['@testing-library/jest-dom/vitest'],
        },
      },
    ],
  },
});
