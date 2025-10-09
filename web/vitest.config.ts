import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['src/tests/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: /^@clerk\/nextjs\/server$/, replacement: path.resolve(__dirname, './src/tests/mocks/clerkNextjsServerMock.ts') },
      { find: /^@clerk\/nextjs$/, replacement: path.resolve(__dirname, './src/tests/mocks/clerkNextjsMock.tsx') },
    ],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
});
