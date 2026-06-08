/**
 * Votes (SRS v1.1 §6.6, VOTE-*, BR-006/007/016). Upvote, confirm, and
 * false-report are rows in one `votes` table keyed by vote_type; the DB
 * unique constraint (report_id, user_id, vote_type) enforces "only once".
 * Confirming auto-subscribes the user to the report (BR-016).
 */
import type { VoteType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { assertReportExists, isUniqueViolation } from './shared.js';

export interface VoteCounts {
  upvotes: number;
  confirms: number;
  falseReports: number;
}

/** Aggregate vote counts per report id (VOTE-005). Always includes every id. */
export async function getVoteCounts(reportIds: string[]): Promise<Map<string, VoteCounts>> {
  const map = new Map<string, VoteCounts>();
  for (const id of reportIds) map.set(id, { upvotes: 0, confirms: 0, falseReports: 0 });
  if (reportIds.length === 0) return map;

  const grouped = await prisma.vote.groupBy({
    by: ['reportId', 'voteType'],
    where: { reportId: { in: reportIds } },
    _count: { _all: true },
  });
  for (const g of grouped) {
    const c = map.get(g.reportId);
    if (!c) continue;
    if (g.voteType === 'upvote') c.upvotes = g._count._all;
    else if (g.voteType === 'confirm') c.confirms = g._count._all;
    else if (g.voteType === 'false_report') c.falseReports = g._count._all;
  }
  return map;
}

async function counts(reportId: string): Promise<VoteCounts> {
  return (await getVoteCounts([reportId])).get(reportId)!;
}

/** Cast a vote; idempotent if the same vote already exists (BR-006/007). */
export async function castVote(
  reportId: string,
  userId: string,
  voteType: VoteType,
): Promise<{ counts: VoteCounts }> {
  await assertReportExists(reportId);
  try {
    await prisma.vote.create({ data: { reportId, userId, voteType } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err; // already voted — no-op
  }

  // Confirming a report subscribes the user to its updates (BR-016).
  if (voteType === 'confirm') {
    await prisma.reportSubscription.createMany({
      data: [{ reportId, userId, source: 'confirm' }],
      skipDuplicates: true,
    });
  }

  return { counts: await counts(reportId) };
}

/** Remove a vote; un-confirming also drops the confirm-sourced subscription. */
export async function removeVote(
  reportId: string,
  userId: string,
  voteType: VoteType,
): Promise<{ counts: VoteCounts }> {
  await assertReportExists(reportId);
  await prisma.vote.deleteMany({ where: { reportId, userId, voteType } });
  if (voteType === 'confirm') {
    await prisma.reportSubscription.deleteMany({
      where: { reportId, userId, source: 'confirm' },
    });
  }
  return { counts: await counts(reportId) };
}
