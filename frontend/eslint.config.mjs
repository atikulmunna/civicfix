import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Every resident page and component is translated (F5): text people read
 * comes from messages/*.json, never from the markup. A new file is covered
 * the moment it exists. Staff pages stay English for now (EnglishOnly).
 */
const RESIDENT_FILES = ['app/**/*.tsx', 'components/**/*.tsx'];
const ENGLISH_ONLY = ['app/admin/**', 'app/department/**', 'components/admin/**'];
const TESTS = ['**/*.test.tsx'];

/** Symbols and punctuation that read the same in every language. */
const LANGUAGE_NEUTRAL = ['·', '→', '←', '▲', '✓', '📍', ',', '.', ':', '(', ')', 'Civic', 'Fix'];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: RESIDENT_FILES,
    ignores: [...ENGLISH_ONLY, ...TESTS],
    rules: {
      // Text inside elements. Props are checked below, only where people read them,
      // since class names and links are strings too.
      'react/jsx-no-literals': [
        'error',
        { noStrings: true, ignoreProps: true, allowedStrings: LANGUAGE_NEUTRAL },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute[name.name=/^(placeholder|aria-label|title|eyebrow|subtitle|label)$/] > Literal, JSXAttribute[name.name='alt'] > Literal[value!=''], CallExpression[callee.name='toast'] > Literal:first-child",
          message: 'Text people read or hear comes from messages/*.json (F5).',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
