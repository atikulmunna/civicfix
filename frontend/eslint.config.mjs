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

/** Attributes whose text people read or hear. */
const READ_ATTRIBUTES = '/^(placeholder|aria-label|title|eyebrow|subtitle|label|alt)$/';
/** A string with letters in it, plain or a template (class names and keys are guarded by place). */
const WORDS =
  ':matches(Literal[value=/[A-Za-z]/], TemplateLiteral:has(TemplateElement[value.raw=/[A-Za-z]/]))';
/** A braces expression among an element's children (not an attribute's value). */
const CHILD = ':matches(JSXElement, JSXFragment) > JSXExpressionContainer';

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
        ...[
          // Attributes people read or hear, written directly or in braces.
          `JSXAttribute[name.name=${READ_ATTRIBUTES}] > ${WORDS}`,
          `JSXAttribute[name.name=${READ_ATTRIBUTES}] > JSXExpressionContainer > ${WORDS}`,
          "JSXAttribute[name.name='alt'] > Literal[value!='']",
          // Text built in braces among an element's children: a ternary's branches
          // (one level of nesting too) or the right side of `&&`.
          `${CHILD} > ConditionalExpression > ${WORDS}`,
          `${CHILD} > ConditionalExpression > ConditionalExpression > ${WORDS}`,
          `${CHILD} > LogicalExpression > ${WORDS}`,
          // Messages handed to people: toasts, form errors, error fallbacks.
          `CallExpression[callee.name='toast'] > ${WORDS}:first-child`,
          `CallExpression[callee.name='setError'] > ${WORDS}`,
          `CallExpression[callee.name='errorText'] > ${WORDS}:nth-child(2)`,
        ].map((selector) => ({
          selector,
          message: 'Text people read or hear comes from messages/*.json (F5).',
        })),
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
