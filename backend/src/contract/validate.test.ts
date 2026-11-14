import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { routes } from './routes.js';
import { checkResponse, toOpenApiPath } from './validate.js';

const user = {
  id: randomUUID(),
  name: 'Rina',
  email: 'rina@example.com',
  role: 'citizen',
  departmentId: null,
  trustScore: 0,
  phone: null,
  phoneIsPublic: false,
  language: null,
  mustChangePassword: false,
  // A Date, as services return it: checked in its JSON (ISO string) form.
  createdAt: new Date(),
};
const me = (u: object) => ({ success: true, data: { user: u } });

describe('toOpenApiPath', () => {
  it('turns Express params into OpenAPI params and drops trailing slashes', () => {
    expect(toOpenApiPath('/api/v1/reports/:id/comments')).toBe('/api/v1/reports/{id}/comments');
    expect(toOpenApiPath('/api/v1/reports/')).toBe('/api/v1/reports');
    expect(toOpenApiPath('/')).toBe('/');
  });
});

describe('checkResponse', () => {
  it('accepts a response that matches its contract', () => {
    expect(checkResponse('GET', '/api/v1/auth/me', 200, me(user))).toBeNull();
  });

  it('rejects a field the contract does not declare (e.g. a leaked column)', () => {
    const leaked = { ...user, passwordHash: '$argon2id$...' };
    expect(checkResponse('GET', '/api/v1/auth/me', 200, me(leaked))).toMatch(
      /Unrecognized key: "passwordHash"/,
    );
  });

  it('rejects a missing or mistyped field', () => {
    const noEmail: Partial<typeof user> = { ...user };
    delete noEmail.email;
    expect(checkResponse('GET', '/api/v1/auth/me', 200, me(noEmail))).toMatch(/email/);
    expect(checkResponse('GET', '/api/v1/auth/me', 200, me({ ...user, role: 'mayor' }))).toMatch(
      /role/,
    );
  });

  it('rejects an undeclared endpoint and an unexpected success status', () => {
    expect(checkResponse('GET', '/api/v1/secret', 200, { success: true, data: {} })).toMatch(
      /no contract entry for GET \/api\/v1\/secret/,
    );
    expect(checkResponse('GET', '/api/v1/auth/me', 201, me(user))).toMatch(/contract says 200/);
    expect(checkResponse('GET', undefined, 200, me(user))).toMatch(/outside any route/);
  });

  it('checks every error against the error envelope', () => {
    const ok = { success: false, message: 'Not found.', code: 'NOT_FOUND' };
    expect(checkResponse('GET', undefined, 404, ok)).toBeNull();
    expect(checkResponse('GET', undefined, 404, { ...ok, code: 'NOPE' })).toMatch(/code/);
    expect(checkResponse('GET', undefined, 500, { error: 'boom' })).toMatch(/error envelope/);
  });
});

describe('the route table', () => {
  it('declares each method and path once', () => {
    const keys = routes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
