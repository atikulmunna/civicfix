/**
 * The web app words server messages from its catalogs (F5). Its English must
 * be exactly what the API sends, and Bangla must cover every key. This reads
 * the catalogs from the frontend package in the same repository.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MESSAGES, MESSAGE_KEYS } from './messages.js';

function catalog(language: 'en' | 'bn'): unknown {
  const file = new URL(`../../../frontend/messages/${language}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The value at a dotted path (`errors.server.report.notFound`), if any. */
function at(tree: unknown, path: string): unknown {
  let node = tree;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe('web catalogs and server messages (F5)', () => {
  const en = catalog('en');
  const bn = catalog('bn');

  it('match the English the API sends, key for key', () => {
    for (const key of MESSAGE_KEYS) {
      expect(at(en, `errors.server.${key}`), key).toBe(MESSAGES[key]);
    }
  });

  it('have Bangla for every key', () => {
    for (const key of MESSAGE_KEYS) {
      const text = at(bn, `errors.server.${key}`);
      expect(typeof text === 'string' && text.length > 0, key).toBe(true);
    }
  });
});
