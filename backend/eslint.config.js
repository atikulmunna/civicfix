// ESLint flat config for the backend: typescript-eslint strict + stylistic
// type-checked rules. eslint-config-prettier comes last so formatting is
// owned by Prettier (root .prettierrc.json) and the two never conflict.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/', 'node_modules/', 'uploads/', 'prisma/migrations/', 'src/generated/'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          // This config file is plain JS outside the TS project; type it with
          // the project's compiler options (Node types included) rather than
          // TypeScript's bare defaults.
          allowDefaultProject: ['eslint.config.js'],
          defaultProject: 'tsconfig.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Numbers stringify predictably in templates (e.g. byte limits, ports);
      // everything else (objects, nullish, any) must still be converted explicitly.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // App code logs through lib/logger.ts (structured, redacted, leveled).
      'no-console': 'error',
    },
  },
  {
    // The seed script is a CLI that reports to the terminal.
    files: ['prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      // supertest types `res.body` as `any` by design. Tests assert on its
      // shape, so the assertion itself is the type check; requiring casts on
      // every response access would add noise without adding safety.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // In tests a wrong non-null assumption fails the test loudly, which is
      // exactly the desired outcome (e.g. `items[0]!.id` after asserting length).
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
