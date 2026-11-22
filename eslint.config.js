import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Game logic must be deterministic: all randomness and time come from the seeded state.
const determinism = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded RNG from the game state.' },
    { object: 'Date', property: 'now', message: 'Game logic must not read the clock.' },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'Game logic must not read the clock.' },
    { name: 'performance', message: 'Game logic must not read the clock.' },
  ],
  'no-restricted-syntax': [
    'error',
    { selector: "NewExpression[callee.name='Date']", message: 'Game logic must not read the clock.' },
  ],
};

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'test-results', 'playwright-report'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/rules/**/*.ts', 'src/run/**/*.ts', 'src/ai/**/*.ts'],
    rules: {
      ...determinism,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui/**', 'react', 'react-dom'], message: 'Engine code must not depend on the UI.' },
          ],
        },
      ],
    },
  },
  prettier,
);
