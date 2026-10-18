import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
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
          exclude: [...configDefaults.exclude, 'test/live/**'],
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
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['@testing-library/jest-dom/vitest'],
        },
      },
    ],
  },
});
