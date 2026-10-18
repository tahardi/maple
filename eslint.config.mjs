import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['node_modules/', 'out/', 'dist/', 'coverage/', 'eslint.config.mjs'] },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked, reactHooks.configs.flat.recommended],
    plugins: eslintComments.recommended.plugins,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@eslint-community/eslint-comments/require-description': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
        { selector: 'TSEnumDeclaration', message: 'Use a string union instead of an enum.' },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render untrusted text as text, never as HTML.',
        },
        {
          selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(inner|outer)HTML$/]',
          message: 'Render untrusted text as text, never as HTML.',
        },
      ],
    },
  },
  {
    files: ['**/*.config.ts', 'electron.vite.config.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use a string union instead of an enum.' },
      ],
    },
  },
  prettier,
);
