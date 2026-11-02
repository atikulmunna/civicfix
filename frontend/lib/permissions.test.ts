import { describe, expect, it } from 'vitest';
import { canManageUser } from './permissions';

const admin = { id: 'a', role: 'admin' as const };
const superAdmin = { id: 's', role: 'super_admin' as const };

describe('canManageUser', () => {
  it('lets admins manage citizens and workers only', () => {
    expect(canManageUser(admin, { id: 'c', role: 'citizen' })).toBe(true);
    expect(canManageUser(admin, { id: 'w', role: 'department_worker' })).toBe(true);
    expect(canManageUser(admin, { id: 'a2', role: 'admin' })).toBe(false);
    expect(canManageUser(admin, superAdmin)).toBe(false);
  });

  it('lets super admins manage everyone but themselves', () => {
    expect(canManageUser(superAdmin, admin)).toBe(true);
    expect(canManageUser(superAdmin, { id: 's2', role: 'super_admin' })).toBe(true);
    expect(canManageUser(superAdmin, superAdmin)).toBe(false);
  });

  it('denies citizens, workers and signed-out viewers', () => {
    expect(canManageUser({ id: 'c', role: 'citizen' }, { id: 'x', role: 'citizen' })).toBe(false);
    expect(
      canManageUser({ id: 'w', role: 'department_worker' }, { id: 'x', role: 'citizen' }),
    ).toBe(false);
    expect(canManageUser(null, { id: 'x', role: 'citizen' })).toBe(false);
  });
});
