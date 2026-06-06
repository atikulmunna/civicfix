/**
 * Report status state machine — implements SRS v1.1 §26.
 *
 * Single source of truth for which status transitions are legal, who may
 * perform them, and what side effects each requires. The reports service
 * must call `assertTransition` before changing a report's status so that
 * illegal changes are rejected with INVALID_STATUS_TRANSITION (STAT-007,
 * BR-015) rather than silently applied.
 */

export type ReportStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'NEEDS_MORE_INFO'
  | 'ARCHIVED';

export type UserRole = 'citizen' | 'department_worker' | 'admin' | 'super_admin';

/** Statuses excluded from duplicate matching and active queues (§26, §6.9). */
export const TERMINAL_STATUSES: ReadonlySet<ReportStatus> = new Set<ReportStatus>([
  'RESOLVED',
  'REJECTED',
  'DUPLICATE',
  'ARCHIVED',
]);

export const isTerminal = (status: ReportStatus): boolean => TERMINAL_STATUSES.has(status);

/** Side-effect flags a caller must satisfy/perform for a given transition. */
export interface TransitionEffects {
  /** Requires reports.internal_note to be set (BR-011). */
  requiresInternalNote?: boolean;
  /** Requires duplicate_of_report_id to be set. */
  requiresDuplicateTarget?: boolean;
  /** Creates a report_assignments row + sets assigned_department_id. */
  createsAssignment?: boolean;
  /** Sets resolved_at = now(). */
  setsResolvedAt?: boolean;
}

interface TransitionRule {
  from: ReportStatus;
  to: ReportStatus;
  /** Roles permitted to perform this transition. */
  allowedRoles: ReadonlyArray<UserRole>;
  effects?: TransitionEffects;
}

/**
 * Owner/department-scoped roles. Note that endpoint-level checks still apply:
 * e.g. a department_worker may only act on reports assigned to their own
 * department (BR-005) — that ownership check lives in the service layer, not
 * here, because it needs the report row.
 */
const ADMINS: ReadonlyArray<UserRole> = ['admin', 'super_admin'];
const DEPT_OR_ADMIN: ReadonlyArray<UserRole> = ['department_worker', 'admin', 'super_admin'];

/** The full transition table from SRS v1.1 §26. */
export const TRANSITIONS: ReadonlyArray<TransitionRule> = [
  { from: 'SUBMITTED', to: 'UNDER_REVIEW', allowedRoles: ADMINS },
  { from: 'SUBMITTED', to: 'REJECTED', allowedRoles: ADMINS, effects: { requiresInternalNote: true } },
  { from: 'SUBMITTED', to: 'DUPLICATE', allowedRoles: ADMINS, effects: { requiresDuplicateTarget: true } },

  { from: 'UNDER_REVIEW', to: 'VERIFIED', allowedRoles: ADMINS },
  { from: 'UNDER_REVIEW', to: 'REJECTED', allowedRoles: ADMINS, effects: { requiresInternalNote: true } },
  { from: 'UNDER_REVIEW', to: 'DUPLICATE', allowedRoles: ADMINS, effects: { requiresDuplicateTarget: true } },
  { from: 'UNDER_REVIEW', to: 'NEEDS_MORE_INFO', allowedRoles: ADMINS },

  { from: 'NEEDS_MORE_INFO', to: 'UNDER_REVIEW', allowedRoles: ADMINS },

  { from: 'VERIFIED', to: 'ASSIGNED', allowedRoles: ADMINS, effects: { createsAssignment: true } },

  { from: 'ASSIGNED', to: 'IN_PROGRESS', allowedRoles: DEPT_OR_ADMIN },
  { from: 'ASSIGNED', to: 'VERIFIED', allowedRoles: ADMINS }, // un-assign / reassign path

  { from: 'IN_PROGRESS', to: 'RESOLVED', allowedRoles: DEPT_OR_ADMIN, effects: { setsResolvedAt: true } },
  { from: 'IN_PROGRESS', to: 'NEEDS_MORE_INFO', allowedRoles: DEPT_OR_ADMIN },

  { from: 'RESOLVED', to: 'ARCHIVED', allowedRoles: ADMINS },
  { from: 'RESOLVED', to: 'IN_PROGRESS', allowedRoles: ADMINS }, // reopen if fix failed

  { from: 'REJECTED', to: 'ARCHIVED', allowedRoles: ADMINS },
];

/**
 * Super Admin administrative override: any non-terminal status -> ARCHIVED (§26).
 * Represented separately so it doesn't need 6 explicit rows.
 */
const SUPER_ADMIN_ARCHIVE_OVERRIDE = true;

function findRule(from: ReportStatus, to: ReportStatus): TransitionRule | undefined {
  return TRANSITIONS.find((r) => r.from === from && r.to === to);
}

export interface TransitionCheck {
  allowed: boolean;
  /** Set when allowed === false. */
  reason?: string;
  /** Set when allowed === true. */
  effects?: TransitionEffects;
}

/**
 * Pure check: is `from -> to` legal for `role`? Does not mutate anything.
 * Ownership/department scoping (BR-005) is enforced by the caller.
 */
export function canTransition(
  from: ReportStatus,
  to: ReportStatus,
  role: UserRole,
): TransitionCheck {
  if (from === to) {
    return { allowed: false, reason: `Report is already ${from}.` };
  }

  // Super Admin override: non-terminal -> ARCHIVED.
  if (
    SUPER_ADMIN_ARCHIVE_OVERRIDE &&
    role === 'super_admin' &&
    to === 'ARCHIVED' &&
    !isTerminal(from)
  ) {
    return { allowed: true, effects: {} };
  }

  const rule = findRule(from, to);
  if (!rule) {
    return { allowed: false, reason: `Transition ${from} -> ${to} is not permitted.` };
  }
  if (!rule.allowedRoles.includes(role)) {
    return {
      allowed: false,
      reason: `Role '${role}' may not perform ${from} -> ${to}.`,
    };
  }
  return { allowed: true, effects: rule.effects ?? {} };
}

/** Error thrown for an illegal transition; maps to HTTP 422 + INVALID_STATUS_TRANSITION. */
export class InvalidStatusTransitionError extends Error {
  readonly code = 'INVALID_STATUS_TRANSITION';
  readonly details: { from: ReportStatus; to: ReportStatus; role: UserRole };

  constructor(from: ReportStatus, to: ReportStatus, role: UserRole, message: string) {
    super(message);
    this.name = 'InvalidStatusTransitionError';
    this.details = { from, to, role };
  }
}

/**
 * Assert that `from -> to` is legal for `role`, returning the required side
 * effects. Throws InvalidStatusTransitionError otherwise. Call this in the
 * reports service before writing the new status; then satisfy the returned
 * effects (note / duplicate target / assignment / resolvedAt) in the same
 * transaction, alongside the mandatory status_history insert (BR-009).
 */
export function assertTransition(
  from: ReportStatus,
  to: ReportStatus,
  role: UserRole,
): TransitionEffects {
  const result = canTransition(from, to, role);
  if (!result.allowed) {
    throw new InvalidStatusTransitionError(from, to, role, result.reason ?? 'Invalid transition.');
  }
  return result.effects ?? {};
}

/** Convenience: all statuses reachable from `from` for `role` (e.g. to build UI menus). */
export function allowedNextStatuses(from: ReportStatus, role: UserRole): ReportStatus[] {
  const all: ReportStatus[] = [
    'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS',
    'RESOLVED', 'REJECTED', 'DUPLICATE', 'NEEDS_MORE_INFO', 'ARCHIVED',
  ];
  return all.filter((to) => canTransition(from, to, role).allowed);
}
