import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        inline: [/packages\/Server\/dist\//, /@mj-biz-apps\/secure-messaging-server/],
      },
    },
  },
});
