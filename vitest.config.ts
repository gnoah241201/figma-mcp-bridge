import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Trỏ thẳng vào source của core để test chạy không cần build trước.
  resolve: {
    alias: {
      '@figma-mcp/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: { include: ['packages/*/tests/**/*.test.ts'] },
});
