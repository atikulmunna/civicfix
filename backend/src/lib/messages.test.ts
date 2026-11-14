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
