import type { Role } from './types';

/**
 * Mirrors the API's account-management hierarchy
 * (backend/src/modules/admin/users.service.ts canManageUser): admins manage
 * citizens and department workers; super admins manage everyone; nobody
 * manages their own account through admin tools. The API enforces this; the
 * UI uses it to hide actions that would be refused.
 */
export function canManageUser(
  actor: { id: string; role: Role } | null,
  target: { id: string; role: Role },
): boolean {
  if (!actor || actor.id === target.id) return false;
  if (actor.role === 'super_admin') return true;
  return actor.role === 'admin' && target.role !== 'admin' && target.role !== 'super_admin';
}
