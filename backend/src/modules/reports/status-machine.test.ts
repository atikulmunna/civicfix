import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  allowedNextStatuses,
  isTerminal,
  TERMINAL_STATUSES,
  InvalidStatusTransitionError,
  type ReportStatus,
  type UserRole,
} from './status-machine.js';

const ALL_STATUSES: ReportStatus[] = [
  'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS',
  'RESOLVED', 'REJECTED', 'DUPLICATE', 'NEEDS_MORE_INFO', 'ARCHIVED',
];

describe('terminal statuses', () => {
  it('marks exactly RESOLVED, REJECTED, DUPLICATE, ARCHIVED as terminal', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      ['ARCHIVED', 'DUPLICATE', 'REJECTED', 'RESOLVED'],
    );
  });

  it('isTerminal agrees with the set', () => {
    for (const s of ALL_STATUSES) {
      expect(isTerminal(s)).toBe(TERMINAL_STATUSES.has(s));
    }
  });
});

describe('legal transitions (§26)', () => {
  it('allows SUBMITTED -> UNDER_REVIEW for admin', () => {
    expect(canTransition('SUBMITTED', 'UNDER_REVIEW', 'admin').allowed).toBe(true);
  });

  it('allows the full happy path with correct roles', () => {
    expect(canTransition('SUBMITTED', 'UNDER_REVIEW', 'admin').allowed).toBe(true);
    expect(canTransition('UNDER_REVIEW', 'VERIFIED', 'admin').allowed).toBe(true);
    expect(canTransition('VERIFIED', 'ASSIGNED', 'admin').allowed).toBe(true);
    expect(canTransition('ASSIGNED', 'IN_PROGRESS', 'department_worker').allowed).toBe(true);
    expect(canTransition('IN_PROGRESS', 'RESOLVED', 'department_worker').allowed).toBe(true);
    expect(canTransition('RESOLVED', 'ARCHIVED', 'admin').allowed).toBe(true);
  });

  it('allows reopen RESOLVED -> IN_PROGRESS for admin only', () => {
    expect(canTransition('RESOLVED', 'IN_PROGRESS', 'admin').allowed).toBe(true);
    expect(canTransition('RESOLVED', 'IN_PROGRESS', 'department_worker').allowed).toBe(false);
  });

  it('allows NEEDS_MORE_INFO -> UNDER_REVIEW round-trip', () => {
    expect(canTransition('UNDER_REVIEW', 'NEEDS_MORE_INFO', 'admin').allowed).toBe(true);
    expect(canTransition('NEEDS_MORE_INFO', 'UNDER_REVIEW', 'admin').allowed).toBe(true);
  });
});

describe('illegal transitions', () => {
  it('rejects a no-op transition (same status)', () => {
    expect(canTransition('SUBMITTED', 'SUBMITTED', 'admin').allowed).toBe(false);
  });

  it('rejects skipping the workflow (SUBMITTED -> RESOLVED)', () => {
    expect(canTransition('SUBMITTED', 'RESOLVED', 'admin').allowed).toBe(false);
  });

  it('rejects backward jump not in table (VERIFIED -> SUBMITTED)', () => {
    expect(canTransition('VERIFIED', 'SUBMITTED', 'admin').allowed).toBe(false);
  });

  it('rejects transitions out of terminal states (except allowed archive/reopen)', () => {
    // REJECTED can only go to ARCHIVED.
    expect(canTransition('REJECTED', 'VERIFIED', 'admin').allowed).toBe(false);
    expect(canTransition('REJECTED', 'ARCHIVED', 'admin').allowed).toBe(true);
    // DUPLICATE and ARCHIVED are dead-ends for normal admins.
    expect(canTransition('DUPLICATE', 'UNDER_REVIEW', 'admin').allowed).toBe(false);
    expect(canTransition('ARCHIVED', 'UNDER_REVIEW', 'admin').allowed).toBe(false);
  });
});

describe('role permissions', () => {
  it('forbids citizens from any status change', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(canTransition(from, to, 'citizen').allowed).toBe(false);
      }
    }
  });

  it('forbids department_worker from admin-only transitions', () => {
    expect(canTransition('SUBMITTED', 'UNDER_REVIEW', 'department_worker').allowed).toBe(false);
    expect(canTransition('UNDER_REVIEW', 'VERIFIED', 'department_worker').allowed).toBe(false);
    expect(canTransition('VERIFIED', 'ASSIGNED', 'department_worker').allowed).toBe(false);
  });

  it('allows department_worker the work transitions', () => {
    expect(canTransition('ASSIGNED', 'IN_PROGRESS', 'department_worker').allowed).toBe(true);
    expect(canTransition('IN_PROGRESS', 'RESOLVED', 'department_worker').allowed).toBe(true);
    expect(canTransition('IN_PROGRESS', 'NEEDS_MORE_INFO', 'department_worker').allowed).toBe(true);
  });
});

describe('super admin archive override (§26)', () => {
  it('lets super_admin archive any non-terminal status', () => {
    const nonTerminal = ALL_STATUSES.filter((s) => !isTerminal(s));
    for (const from of nonTerminal) {
      expect(canTransition(from, 'ARCHIVED', 'super_admin').allowed).toBe(true);
    }
  });

  it('does not let super_admin override terminal -> ARCHIVED beyond normal rules', () => {
    // DUPLICATE is terminal and has no path to ARCHIVED in the table.
    expect(canTransition('DUPLICATE', 'ARCHIVED', 'super_admin').allowed).toBe(false);
  });

  it('does not grant super_admin illegal non-archive jumps', () => {
    expect(canTransition('SUBMITTED', 'RESOLVED', 'super_admin').allowed).toBe(false);
  });
});

describe('side-effect flags', () => {
  it('flags internal note requirement on rejections', () => {
    expect(canTransition('SUBMITTED', 'REJECTED', 'admin').effects).toEqual({
      requiresInternalNote: true,
    });
    expect(canTransition('UNDER_REVIEW', 'REJECTED', 'admin').effects).toEqual({
      requiresInternalNote: true,
    });
  });

  it('flags duplicate target requirement on DUPLICATE transitions', () => {
    expect(canTransition('SUBMITTED', 'DUPLICATE', 'admin').effects).toEqual({
      requiresDuplicateTarget: true,
    });
  });

  it('flags assignment creation on VERIFIED -> ASSIGNED', () => {
    expect(canTransition('VERIFIED', 'ASSIGNED', 'admin').effects).toEqual({
      createsAssignment: true,
    });
  });

  it('flags resolvedAt on IN_PROGRESS -> RESOLVED', () => {
    expect(canTransition('IN_PROGRESS', 'RESOLVED', 'admin').effects).toEqual({
      setsResolvedAt: true,
    });
  });
});

describe('assertTransition', () => {
  it('returns effects on a legal transition', () => {
    expect(assertTransition('IN_PROGRESS', 'RESOLVED', 'admin')).toEqual({
      setsResolvedAt: true,
    });
  });

  it('throws InvalidStatusTransitionError with code + details on illegal transition', () => {
    try {
      assertTransition('SUBMITTED', 'RESOLVED', 'citizen');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidStatusTransitionError);
      const e = err as InvalidStatusTransitionError;
      expect(e.code).toBe('INVALID_STATUS_TRANSITION');
      expect(e.details).toEqual({ from: 'SUBMITTED', to: 'RESOLVED', role: 'citizen' });
    }
  });
});

describe('allowedNextStatuses', () => {
  it('lists admin options from SUBMITTED', () => {
    expect(allowedNextStatuses('SUBMITTED', 'admin').sort()).toEqual(
      ['DUPLICATE', 'REJECTED', 'UNDER_REVIEW'],
    );
  });

  it('returns empty for citizens everywhere', () => {
    for (const from of ALL_STATUSES) {
      expect(allowedNextStatuses(from, 'citizen')).toEqual([]);
    }
  });

  it('every listed next status is actually permitted', () => {
    const roles: UserRole[] = ['admin', 'super_admin', 'department_worker', 'citizen'];
    for (const role of roles) {
      for (const from of ALL_STATUSES) {
        for (const to of allowedNextStatuses(from, role)) {
          expect(canTransition(from, to, role).allowed).toBe(true);
        }
      }
    }
  });
});
