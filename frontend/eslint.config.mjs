import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Translated files (F5): text people read comes from messages/*.json, never
 * from the markup. Each translated page or component is added here.
 */
const TRANSLATED_FILES = [
  'components/navbar.tsx',
  'components/language-switch.tsx',
  'components/badges.tsx',
  'components/status-timeline.tsx',
  'components/report-card.tsx',
  'components/merged-notice.tsx',
  'components/recurrence-note.tsx',
  'components/vote-bar.tsx',
  'components/comment-section.tsx',
  'components/fix-checks.tsx',
  'components/ui.tsx',
  'app/reports/page.tsx',
  'app/reports/[[]id]/page.tsx',
  'app/page.tsx',
];

/** Symbols and punctuation that read the same in every language. */
const LANGUAGE_NEUTRAL = ['·', '→', '←', '▲', '✓', '📍', ',', '.', ':', '(', ')', 'Civic', 'Fix'];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: TRANSLATED_FILES,
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
