import { playwright } from '@vitest/browser-playwright';
import { styleBuild } from '@neon-kit/vite-plugin-style-build';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    cacheDir: `node_modules/.vite-tests-${process.env.NEON_TEST_BROWSER ?? 'chromium'}`,
    plugins: [styleBuild()],
    test: {
        include: ['**/tests/**/*.spec.mjs'],
        exclude: ['**/node_modules/**'],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: process.env.NEON_TEST_BROWSER ?? 'chromium' }],
        },
        coverage: {
            provider: 'v8',
            reportsDirectory: './coverage',
            exclude: ['node_modules', '**/tests/**', '**/dist/**', '**/types/**', '**/*.config.js', '**/*.d.ts'],
        },
    },
});
