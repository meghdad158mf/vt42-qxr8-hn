// آزمون‌های واحد تابع‌های حساس هسته (npm run test:unit) — جدا از vite.config.js که root آن design/ است
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
