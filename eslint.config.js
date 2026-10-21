// بررسی ایستای کد فرانت‌اند (npm run lint)
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'design/vendor/**', 'brand-kit/**', 'feature-kit/**', 'test-results/**', 'playwright-report/**', 'supabase/**'] },
  {
    files: ['design/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      // کتابخانه‌های design/vendor به‌صورت سراسری (gsap با تگ ثابت، بقیه با loadScriptOnce)
      globals: { ...globals.browser, gsap: 'readonly', Chart: 'readonly', html2canvas: 'readonly', jspdf: 'readonly' },
    },
    rules: {
      ...js.configs.recommended.rules,
      // کد قدیمی app.js هنوز این‌ها رو زیاد داره؛ در مرحله‌های بعدی ماژولار کردن سخت‌گیرتر می‌شه
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // نیم‌فاصله و نویسه‌های جهت‌نما داخل regex/رشته‌ها عمدی‌ان (یکسان‌سازی متن فارسی)
      'no-irregular-whitespace': ['error', { skipStrings: true, skipRegExps: true, skipTemplates: true }],
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['error', { caughtErrors: 'none' }] },
  },
];
