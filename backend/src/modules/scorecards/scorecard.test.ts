import { describe, expect, it } from 'vitest';
import { median, scorecard, type AssignmentFacts } from './scorecard.js';

const now = new Date('2026-11-03T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const dept = { id: 'd1', name: 'Public Works' };

let n = 0;
function fact(over: Partial<AssignmentFacts>): AssignmentFacts {
  n += 1;
  return {
    reportId: `r${String(n)}`,
    title: `Report ${String(n)}`,
    severity: 'high',
    status: 'ASSIGNED',
    assignedAt: hoursAgo(10),
    firstResponseAt: null,
    resolvedAt: null,
    ...over,
  };
}

describe('scorecard', () => {
  it('counts assignments, resolutions and the resolution rate in the window', () => {
    const card = scorecard(
      dept,
      [
        fact({ status: 'RESOLVED', assignedAt: hoursAgo(100), resolvedAt: hoursAgo(50) }),
        fact({ status: 'IN_PROGRESS', firstResponseAt: hoursAgo(5) }),
        fact({ status: 'REJECTED' }), // closed without a fix: not resolvable
        fact({
          status: 'RESOLVED',
          assignedAt: hoursAgo(24 * 120),
          resolvedAt: hoursAgo(24 * 119),
        }), // outside 90 days
      ],
      now,
    );
    expect(card).toMatchObject({
      departmentId: 'd1',
      name: 'Public Works',
      assigned: 3,
      resolved: 1,
    });
    expect(card.resolutionRate).toBe(0.5); // 1 of 2 resolvable
    expect(card.medianResolveHours).toBe(50);
    expect(card.medianResponseHours).toBe(5);
  });

  it('measures on time against the severity targets, counting only known outcomes', () => {
    const card = scorecard(
      dept,
      [
        // high: respond within 48 h, resolve within 168 h
        fact({ assignedAt: hoursAgo(100), firstResponseAt: hoursAgo(80) }), // 20 h: on time
        fact({ assignedAt: hoursAgo(100), firstResponseAt: hoursAgo(10) }), // 90 h: late
        fact({ assignedAt: hoursAgo(60) }), // no response, 60 h > 48 h: overdue, counts as late
        fact({ assignedAt: hoursAgo(10) }), // no response yet, still in time: not counted
      ],
      now,
    );
    expect(card.respondedOnTimeRate).toBe(0.3333);
    // No resolution is due yet (all under 168 h, none resolved).
    expect(card.resolvedOnTimeRate).toBeNull();
  });

  it('uses the tighter targets for urgent reports', () => {
    // urgent: respond within 24 h. 30 h is late for urgent but fine for high.
    const urgent = scorecard(
      dept,
      [fact({ severity: 'urgent', assignedAt: hoursAgo(40), firstResponseAt: hoursAgo(10) })],
      now,
    );
    const high = scorecard(
      dept,
      [fact({ severity: 'high', assignedAt: hoursAgo(40), firstResponseAt: hoursAgo(10) })],
      now,
    );
    expect(urgent.respondedOnTimeRate).toBe(0);
    expect(high.respondedOnTimeRate).toBe(1);
  });

  it('lists open reports past their resolution target, most overdue first, whatever their age', () => {
    const card = scorecard(
      dept,
      [
        fact({ title: 'Recent and late', severity: 'urgent', assignedAt: hoursAgo(100) }), // 72 h target: 28 h over
        fact({ title: 'Ancient', severity: 'low', assignedAt: hoursAgo(24 * 200) }), // outside the window
        fact({ title: 'Not yet due', severity: 'low', assignedAt: hoursAgo(100) }),
        fact({
          title: 'Closed',
          status: 'RESOLVED',
          assignedAt: hoursAgo(24 * 30),
          resolvedAt: hoursAgo(1),
        }),
      ],
      now,
    );
    expect(card.overdue.map((o) => o.title)).toEqual(['Ancient', 'Recent and late']);
    expect(card.overdue[1]).toMatchObject({
      severity: 'urgent',
      hoursOverdue: 28,
      dueAt: hoursAgo(28),
    });
  });

  it('reports nothing measured as null rather than zero', () => {
    const card = scorecard(dept, [], now);
    expect(card).toMatchObject({
      assigned: 0,
      resolved: 0,
      resolutionRate: null,
      medianResponseHours: null,
      medianResolveHours: null,
      respondedOnTimeRate: null,
      resolvedOnTimeRate: null,
      overdue: [],
    });
  });
});

describe('median', () => {
  it('takes the middle value, or the mean of the middle two', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
