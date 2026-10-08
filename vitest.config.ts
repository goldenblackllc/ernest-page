import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.tsx'],
        // Other agent sessions' worktrees live under .claude/
        exclude: [...configDefaults.exclude, '.claude/**'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@functions': path.resolve(__dirname, './functions/src'),
        },
    },
});
