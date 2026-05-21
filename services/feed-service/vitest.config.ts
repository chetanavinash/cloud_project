import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@prisma/user-client': path.resolve(__dirname, '../../node_modules/@prisma/user-client'),
      '@prisma/post-client': path.resolve(__dirname, '../../node_modules/@prisma/post-client'),
    },
  },
});
