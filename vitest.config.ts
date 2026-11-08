// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // README examples import the package by name; point that at the source.
    alias: [
      { find: /^@afkzona\/kerbcut\/playwright$/, replacement: fileURLToPath(new URL('./src/playwright/index.ts', import.meta.url)) },
      { find: /^@afkzona\/kerbcut$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/data/*.generated.ts', 'src/cli/main.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});
