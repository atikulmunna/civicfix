/**
 * Explainable triage (F1): how urgent an open report is, and why.
 *
 * Priority builds on SRS v1.1 §21 (severity, confirmations, days open) and
 * adds two F1 signals: false-report flags lower a report, and the reporter's
 * track record (trust score) moves it a little either way. Closed reports
 * (resolved, rejected, duplicate, archived) are not ranked.
 *
 * Pure functions: the same code produces the stored sort key (anchor), the
 * score clients see, and the breakdown admins read, so they cannot disagree.
 */
import type { ReportStatus, Severity } from '../../generated/prisma/client.js';
import { isTerminal } from './status-machine.js';

export const PRIORITY_WEIGHTS = {
  severity: { low: 10, medium: 20, high: 35, urgent: 50 } satisfies Record<Severity, number>,
  perConfirmation: 2,
  /** Confirmations beyond this add nothing (max +50): no pile-ons. */
  maxConfirmations: 25,
  perDayOpen: 1,
  perFalseReport: -5,
  /** Flags never take off more than this. */
  minFlagPoints: -30,
  /** Reporter points = trust / 5, so -10 .. +10 for trust in -50 .. +50. */
  trustDivisor: 5,
} as const;

export const TRUST_RULES = {
  /** Per report of theirs that was ever verified or resolved. */
  perUpheldReport: 5,
  /** Per report of theirs that was rejected. */
  perRejectedReport: -10,
  min: -50,
  max: 50,
} as const;

const DAY_MS = 86_400_000;

/**
 * Whole UTC days since the epoch. "Days open" counts the UTC midnights since
 * a report was created; that is what lets the stored anchor stay valid.
 */
export function dayNumber(at: Date): number {
  return Math.floor(at.getTime() / DAY_MS);
}

export interface PriorityInput {
  status: ReportStatus;
  severity: Severity;
  confirms: number;
  falseReports: number;
  reporterTrust: number;
  createdAt: Date;
}

/** Each part's points, the total, and the day count behind "waiting". */
export interface PriorityBreakdown {
  severity: number;
  confirmations: number;
  waiting: number;
  flags: number;
  reporter: number;
  total: number;
  daysOpen: number;
}

/** The parts that do not change from one day to the next. */
function fixedParts(input: PriorityInput) {
  const w = PRIORITY_WEIGHTS;
  return {
    severity: w.severity[input.severity],
    confirmations: Math.min(input.confirms, w.maxConfirmations) * w.perConfirmation,
    flags: Math.max(input.falseReports * w.perFalseReport, w.minFlagPoints),
    reporter: Math.trunc(input.reporterTrust / w.trustDivisor),
  };
}

const sum = (p: ReturnType<typeof fixedParts>) =>
  p.severity + p.confirmations + p.flags + p.reporter;

/** Why an open report scores what it does today; null for a closed report. */
export function priorityBreakdown(input: PriorityInput, now: Date): PriorityBreakdown | null {
  if (isTerminal(input.status)) return null;
  const parts = fixedParts(input);
  const daysOpen = dayNumber(now) - dayNumber(input.createdAt);
  const waiting = daysOpen * PRIORITY_WEIGHTS.perDayOpen;
  return { ...parts, waiting, daysOpen, total: sum(parts) + waiting };
}

/**
 * The stored sort key: today's score minus the part that grows each day.
 * Sorting by it orders open reports exactly like sorting by today's score,
 * whatever "today" is. Null for a closed report.
 */
export function priorityAnchor(input: PriorityInput): number | null {
  if (isTerminal(input.status)) return null;
  return sum(fixedParts(input)) - dayNumber(input.createdAt) * PRIORITY_WEIGHTS.perDayOpen;
}

/** The score shown to clients today, from the stored anchor (0 when closed). */
export function priorityFromAnchor(anchor: number | null, now: Date): number {
  return anchor === null ? 0 : anchor + dayNumber(now) * PRIORITY_WEIGHTS.perDayOpen;
}

/** A reporter's trust from the outcomes of their reports, within -50 .. +50. */
export function trustScore(outcomes: { upheld: number; rejected: number }): number {
  const raw =
    outcomes.upheld * TRUST_RULES.perUpheldReport +
    outcomes.rejected * TRUST_RULES.perRejectedReport;
  return Math.min(TRUST_RULES.max, Math.max(TRUST_RULES.min, raw));
}
