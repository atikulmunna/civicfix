import { beforeEach, describe, expect, it, vi } from 'vitest';

const { set } = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ set }) }));

import { setLocale } from './actions';

describe('setLocale', () => {
  beforeEach(() => {
    set.mockReset();
  });

  it('remembers the language for a year in a cookie the server sets', async () => {
    await setLocale('bn');
    expect(set).toHaveBeenCalledWith('locale', 'bn', {
      maxAge: 31536000,
      path: '/',
      sameSite: 'lax',
    });
  });

  it('accepts a language in any case', async () => {
    await setLocale('EN');
    expect(set).toHaveBeenCalledWith('locale', 'en', expect.anything());
  });

  it('ignores anything that is not one of the two languages', async () => {
    for (const value of ['fr', '', 'bn; Path=/admin', '<script>']) await setLocale(value);
    expect(set).not.toHaveBeenCalled();
  });
});
