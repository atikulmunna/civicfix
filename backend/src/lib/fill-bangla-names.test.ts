/**
 * The one-off data migration that gives existing databases the seeded Bangla
 * names (F5). It must fill only empty Bangla names of exactly seeded English
 * names, and change nothing when run again. Everything here happens inside
 * one transaction that is rolled back, so no other data is touched.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './prisma.js';

const MIGRATIONS = new URL('../../prisma/migrations/', import.meta.url);

function migrationStatements(): string[] {
  const dir = readdirSync(MIGRATIONS).find((d) => d.endsWith('_fill_bangla_names'));
  if (!dir) throw new Error('no fill_bangla_names migration');
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

describe('fill_bangla_names migration (F5)', () => {
  it('fills only empty Bangla names of exactly seeded names', async () => {
    const statements = migrationStatements();
    const seen: Record<string, (string | null)[]> = {};
    await prisma
      .$transaction(async (tx) => {
        const category = (name: string, nameBn: string | null) =>
          tx.category.upsert({ where: { name }, update: { nameBn }, create: { name, nameBn } });
        await category('Street Lighting', null);
        await category('Electricity', 'বিদ্যুৎ (নিজস্ব)');
        await category('Street lighting', null);
        await tx.department.upsert({
          where: { name: 'Electricity Board' },
          update: { nameBn: null },
          create: { name: 'Electricity Board' },
        });

        // By exact name: ordering these by name would depend on the database collation.
        const bn = async (name: string) =>
          (await tx.category.findUniqueOrThrow({ where: { name } })).nameBn;
        const read = async () => [
          await bn('Street Lighting'),
          await bn('Electricity'),
          await bn('Street lighting'),
          (await tx.department.findUniqueOrThrow({ where: { name: 'Electricity Board' } })).nameBn,
        ];

        // The real migration file, run as written: no input reaches it, and testing
        // that file is the point, so this is the one place raw SQL is not tagged.
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        seen.first = await read();
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        seen.again = await read();
        throw new Rollback();
      })
      .catch((err: unknown) => {
        if (!(err instanceof Rollback)) throw err;
      });

    // Seeded and empty: filled. Already set: kept. Different case: not a seeded name.
    expect(seen.first).toEqual(['রাস্তার বাতি', 'বিদ্যুৎ (নিজস্ব)', null, 'বিদ্যুৎ বোর্ড']);
    expect(seen.again).toEqual(seen.first);
  });

  it('uses exactly the names the seed gives', () => {
    const pairs = (text: string, pattern: RegExp) =>
      [...text.matchAll(pattern)].map(([, en, bn]) => `${en ?? ''} = ${bn ?? ''}`).sort();
    const seed = readFileSync(new URL('../../prisma/seed.ts', import.meta.url), 'utf8');
    const fromSeed = pairs(seed, /name: '([^']+)',\s*nameBn: '([^']+)'/g);
    const fromMigration = pairs(migrationStatements().join('\n'), /\('([^']+)', '([^']+)'\)/g);
    expect(fromSeed).toHaveLength(12);
    expect(fromMigration).toEqual(fromSeed);
  });
});
