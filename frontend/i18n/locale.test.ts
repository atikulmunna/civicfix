import { describe, expect, it } from 'vitest';
import { asLocale, resolveLocale } from './locale';

describe('asLocale', () => {
  it('accepts the two languages in any case, and nothing else', () => {
    expect(asLocale('bn')).toBe('bn');
    expect(asLocale('EN')).toBe('en');
    for (const other of ['fr', '', ' bn', undefined, null]) expect(asLocale(other)).toBeUndefined();
  });
});

describe('resolveLocale', () => {
  it('follows the cookie first', () => {
    expect(resolveLocale('bn', 'en-US')).toBe('bn');
    expect(resolveLocale('BN', null)).toBe('bn');
    expect(resolveLocale('en', 'bn-BD')).toBe('en');
  });

  it('ignores a cookie it does not know', () => {
    expect(resolveLocale('fr', 'en-US')).toBe('en');
    expect(resolveLocale('', 'bn')).toBe('bn');
  });

  it('takes Bangla from the browser when it is acceptable at all', () => {
    expect(resolveLocale(undefined, 'bn-BD,bn;q=0.9,en;q=0.8')).toBe('bn');
    expect(resolveLocale(undefined, 'en-US,bn;q=0.5')).toBe('bn');
    expect(resolveLocale(undefined, 'bn-IN')).toBe('bn');
  });

  it('does not take Bangla the browser marks as not acceptable', () => {
    expect(resolveLocale(undefined, 'en-US, bn;q=0')).toBe('en');
    expect(resolveLocale(undefined, 'en-US, bn;q=0.000')).toBe('en');
  });

  it('falls back to English', () => {
    expect(resolveLocale(undefined, null)).toBe('en');
    expect(resolveLocale(undefined, 'fr-FR,de;q=0.7')).toBe('en');
    expect(resolveLocale(undefined, 'not a header')).toBe('en');
  });
});
