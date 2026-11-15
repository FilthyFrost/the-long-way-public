import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['harness/sim/**/*.test.ts'],
    testTimeout: 240_000,
    hookTimeout: 240_000,
  },
});
