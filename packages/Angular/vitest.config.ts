import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: [
      '@angular/core',
      '@angular/common',
      '@angular/compiler',
      '@angular/forms',
      '@angular/platform-browser',
      '@angular/animations',
      'rxjs',
    ],
  },
  test: {
    include: ['src/__tests__/**/*.spec.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    server: {
      deps: {
        inline: [/@memberjunction\/ng-/, /@angular\//],
      },
    },
  },
});
