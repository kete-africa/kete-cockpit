import { fileURLToPath, URL } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    name: 'cockpit',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
