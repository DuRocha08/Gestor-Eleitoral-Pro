module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'readonly', exports: 'readonly', process: 'readonly',
        Buffer: 'readonly', URL: 'readonly', AbortSignal: 'readonly', fetch: 'readonly',
        console: 'readonly', setTimeout: 'readonly', setImmediate: 'readonly', clearTimeout: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none',
      }],
      'no-undef': 'error',
      'no-constant-condition': 'error',
    },
  },
];
