import { describe, expect, it } from 'vitest';
import {
  dayNumber,
  priorityAnchor,
  priorityBreakdown,
  priorityFromAnchor,
  trustScore,
  type PriorityInput,
} from './priority.js';

const created = new Date('2026-11-01T10:00:00Z');
const base: PriorityInput = {
  status: 'SUBMITTED',
  severity: 'high',
  confirms: 0,
  falseReports: 0,
  reporterTrust: 0,
  createdAt: created,
};
const at = (iso: string) => new Date(iso);

describe('priorityBreakdown', () => {
  it('scores the example from the agreed formula', () => {
    // high 35 + 6 confirmations 12 + 9 days 9 - 1 flag 5 + trust 20 -> +4 = 55
    const b = priorityBreakdown(
      { ...base, confirms: 6, falseReports: 1, reporterTrust: 20 },
      at('2026-11-10T08:00:00Z'),
    );
    expect(b).toEqual({
      severity: 35,
      confirmations: 12,
      waiting: 9,
      flags: -5,
      reporter: 4,
      total: 55,
      daysOpen: 9,
    });
  });

  it('weights each severity as in SRS §21', () => {
    const now = created;
    const total = (severity: PriorityInput['severity']) =>
      priorityBreakdown({ ...base, severity }, now)?.total;
    expect([total('low'), total('medium'), total('high'), total('urgent')]).toEqual([
      10, 20, 35, 50,
    ]);
  });

  it('caps confirmations at +50 and flags at -30', () => {
    const b = priorityBreakdown({ ...base, confirms: 400, falseReports: 40 }, created);
    expect(b?.confirmations).toBe(50);
    expect(b?.flags).toBe(-30);
  });

  it('maps trust -50 .. +50 onto -10 .. +10, rounding toward zero', () => {
    const reporter = (reporterTrust: number) =>
      priorityBreakdown({ ...base, reporterTrust }, created)?.reporter;
    expect([reporter(50), reporter(-50), reporter(7), reporter(-7), reporter(0)]).toEqual([
      10, -10, 1, -1, 0,
    ]);
  });

  it('counts days open as UTC midnights passed', () => {
    expect(priorityBreakdown(base, at('2026-11-01T23:59:59Z'))?.daysOpen).toBe(0);
    expect(priorityBreakdown(base, at('2026-11-02T00:00:00Z'))?.daysOpen).toBe(1);
  });

  it('does not rank closed reports', () => {
    for (const status of ['RESOLVED', 'REJECTED', 'DUPLICATE', 'ARCHIVED'] as const) {
      expect(priorityBreakdown({ ...base, status }, created)).toBeNull();
      expect(priorityAnchor({ ...base, status })).toBeNull();
    }
  });
});

describe('priority anchor', () => {
  it('gives the same score as the breakdown on any later day', () => {
    const input: PriorityInput = { ...base, confirms: 3, falseReports: 2, reporterTrust: -13 };
    const anchor = priorityAnchor(input);
    for (let d = 0; d < 400; d += 37) {
      const now = new Date(created.getTime() + d * 86_400_000 + 3_600_000);
      expect(priorityFromAnchor(anchor, now)).toBe(priorityBreakdown(input, now)?.total);
    }
  });

  it('orders reports created on different days like their scores today', () => {
    const now = at('2026-12-01T12:00:00Z');
    const older = { ...base, severity: 'low' as const, createdAt: at('2026-10-01T00:00:00Z') };
    const newer = { ...base, severity: 'urgent' as const, createdAt: at('2026-11-30T00:00:00Z') };
    const byScore = Math.sign(
      (priorityBreakdown(older, now)?.total ?? 0) - (priorityBreakdown(newer, now)?.total ?? 0),
    );
    const byAnchor = Math.sign((priorityAnchor(older) ?? 0) - (priorityAnchor(newer) ?? 0));
    expect(byAnchor).toBe(byScore);
  });

  it('shows 0 for a closed report', () => {
    expect(priorityFromAnchor(null, created)).toBe(0);
  });

  it('uses whole UTC days', () => {
    expect(dayNumber(at('1970-01-02T00:00:00Z'))).toBe(1);
  });
});

describe('trustScore', () => {
  it('adds 5 per upheld report and takes 10 per rejected one', () => {
    expect(trustScore({ upheld: 4, rejected: 0 })).toBe(20);
    expect(trustScore({ upheld: 4, rejected: 1 })).toBe(10);
  });

  it('stays within -50 .. +50', () => {
    expect(trustScore({ upheld: 30, rejected: 0 })).toBe(50);
    expect(trustScore({ upheld: 0, rejected: 9 })).toBe(-50);
  });
});
