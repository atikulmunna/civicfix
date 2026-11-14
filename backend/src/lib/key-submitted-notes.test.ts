/**
 * Every report's first history row says "Report submitted.". Rows written
 * before note keys existed get the key from a one-off data migration (F5), so
 * Bangla readers do not meet that English line on every older report. Only the
 * server writes a report's first row (old_status null), so the exact text there
 * is never an admin's own note. Runs in a rolled-back transaction.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './prisma.js';

const MIGRATIONS = new URL('../../prisma/migrations/', import.meta.url);

function migrationStatements(name: string): string[] {
  const dir = readdirSync(MIGRATIONS).find((d) => d.endsWith(`_${name}`));
  if (!dir) throw new Error(`no ${name} migration`);
  const sql = readFileSync(new URL(`${dir}/migration.sql`, MIGRATIONS), 'utf8');
  return sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.split('\n').some((line) => line.trim() && !line.trim().startsWith('--')));
}

class Rollback extends Error {}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('key_submitted_notes migration (F5)', () => {
  it("keys only the server's own first note, and changes nothing on a second run", async () => {
    const statements = migrationStatements('key_submitted_notes');
    const seen: Record<string, unknown[]> = {};
    const stamp = Date.now();
    await prisma
      .$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: 'Backfill', email: `backfill_${stamp}@example.com`, passwordHash: 'x' },
        });
        const category = await tx.category.create({ data: { name: `Backfill ${stamp}` } });
        const report = await tx.report.create({
          data: {
            userId: user.id,
            title: 'Backfill check',
            description: 'A report for the backfill test.',
            categoryId: category.id,
            severity: 'low',
            latitude: 23.7,
            longitude: 90.4,
          },
        });
        const row = (data: {
          oldStatus: 'SUBMITTED' | null;
          note: string | null;
          noteKey?: string;
        }) =>
          tx.statusHistory.create({
            data: {
              reportId: report.id,
              newStatus: 'SUBMITTED',
              changedBy: user.id,
              ...data,
              ...(data.noteKey ? { noteParams: {} } : {}),
            },
          });
        const first = await row({ oldStatus: null, note: 'Report submitted.' });
        const typedLater = await row({ oldStatus: 'SUBMITTED', note: 'Report submitted.' });
        const otherFirst = await row({ oldStatus: null, note: 'Imported from the old system.' });
        const keyed = await row({
          oldStatus: null,
          note: 'Report submitted.',
          noteKey: 'report.submitted',
        });

        const read = async () =>
          Promise.all(
            [first, typedLater, otherFirst, keyed].map(async ({ id }) => {
              const h = await tx.statusHistory.findUniqueOrThrow({ where: { id } });
              return [h.noteKey, h.noteParams];
            }),
          );

        // The real migration file, run as written (no input reaches it).
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        seen.first = await read();
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        seen.again = await read();
        throw new Rollback();
      })
      .catch((err: unknown) => {
        if (!(err instanceof Rollback)) throw err;
      });

    expect(seen.first).toEqual([
      ['report.submitted', {}],
      [null, null],
      [null, null],
      ['report.submitted', {}],
    ]);
    expect(seen.again).toEqual(seen.first);
  });
});
