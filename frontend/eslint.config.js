import react from 'eslint-plugin-react';

export default [
  {
    files: ['src/**/*.{js,jsx}', 'test/**/*.js', 'e2e/**/*.js', '*.js'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', sessionStorage: 'readonly', localStorage: 'readonly',
        navigator: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', FormData: 'readonly',
        fetch: 'readonly', Event: 'readonly', TextEncoder: 'readonly', setTimeout: 'readonly',
        clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        console: 'readonly', process: 'readonly', atob: 'readonly',
      },
    },
    plugins: { react },
    rules: {
      'no-unused-vars': ['error', {
        args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none',
      }],
      'no-undef': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    },
  },
];
