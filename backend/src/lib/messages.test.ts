import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MESSAGES, MESSAGE_KEYS, keyOf, message, zodMessage } from './messages.js';

describe('server messages (F5)', () => {
  it('fills placeholders with the given values', () => {
    expect(message('auth.passwordTooShort', { min: 8 })).toEqual({
      key: 'auth.passwordTooShort',
      params: { min: 8 },
      text: 'Password must be at least 8 characters.',
    });
    expect(message('report.notFound')).toEqual({
      key: 'report.notFound',
      text: 'Report not found.',
    });
  });

  it('finds a message again by its text, params included', () => {
    const text = zodMessage('field.titleTooShort', { min: 3 });
    expect(text).toBe('Title must be at least 3 characters.');
    expect(keyOf(text)).toEqual({ key: 'field.titleTooShort', params: { min: 3 }, text });
    // Messages without params are known from the start.
    expect(keyOf('Invalid request data.')?.key).toBe('common.invalidRequest');
    expect(keyOf('Something the server never says.')).toBeUndefined();
  });

  it('lists every key once, with no dashes in any text', () => {
    expect([...MESSAGE_KEYS]).toEqual(Object.keys(MESSAGES));
    for (const text of Object.values(MESSAGES)) expect(text).not.toMatch(/[–—]/);
  });

  it('keeps the English the API already sends', () => {
    expect(MESSAGES['common.invalidRequest']).toBe('Invalid request data.');
    expect(MESSAGES['common.rateLimited']).toBe('Too many requests. Please try again later.');
    expect(MESSAGES['auth.badCredentials']).toBe('Invalid email or password.');
    expect(MESSAGES['field.email']).toBe('A valid email is required.');
    expect(MESSAGES['field.category']).toBe('A valid category is required.');
  });
});

/** Files whose errors residents can meet (F5). Admin modules keep plain English. */
const RESIDENT_FILES = [
  'app.ts',
  'lib/uploads.ts',
  'lib/prisma-errors.ts',
  'middleware/require-auth.ts',
  'modules/auth/auth.routes.ts',
  'modules/auth/auth.service.ts',
  'modules/auth/password.ts',
  'modules/users/me.routes.ts',
  'modules/users/me.service.ts',
  'modules/reports/reports.routes.ts',
  'modules/reports/reports.service.ts',
  'modules/community/comments.service.ts',
  'modules/community/community.routes.ts',
  'modules/community/shared.ts',
  'modules/fix-checks/fix-checks.routes.ts',
  'modules/fix-checks/fix-checks.service.ts',
  'modules/notifications/notifications.routes.ts',
  'modules/notifications/notifications.service.ts',
];

/** The argument text of every `new ApiError(...)` call in `source`. */
function apiErrorCalls(source: string): string[] {
  const calls: string[] = [];
  let at = source.indexOf('new ApiError(');
  while (at !== -1) {
    let depth = 0;
    let end = at + 'new ApiError'.length;
    do {
      const ch = source[end];
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      end += 1;
    } while (depth > 0 && end < source.length);
    calls.push(source.slice(at + 'new ApiError('.length, end - 1));
    at = source.indexOf('new ApiError(', end);
  }
  return calls;
}

describe('resident-facing errors (F5)', () => {
  it('every resident-facing throw uses a key', () => {
    const literal: string[] = [];
    for (const file of RESIDENT_FILES) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const args of apiErrorCalls(source)) {
        // Drop the code (first argument) and keyed messages; any text left is literal English.
        const rest = args
          .replace(/^\s*'[A-Z_]+'\s*,?/, '')
          .replace(/message\(\s*'[\w.]+'(?:\s*,\s*\{[^}]*\})?\s*\)/g, '');
        if (/['"`]/.test(rest)) literal.push(`${file}: ${args.replace(/\s+/g, ' ').trim()}`);
      }
    }
    expect(literal).toEqual([]);
  });
});
