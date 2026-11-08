/**
 * Seed data (SRS v1.1 §23). Creates a super admin, admin, two department
 * workers, several citizens, categories, departments, 20+ reports across
 * categories/statuses with status histories + owner subscriptions, plus
 * sample comments, votes, confirm-subscriptions, and one resolved report with
 * before/after images.
 *
 * Re-runnable: wipes existing data first. Run with `npm run seed`.
 */
import 'dotenv/config';
import type { ReportStatus, Severity } from '../src/generated/prisma/client.js';
import { createPrismaClient } from '../src/lib/prisma-client.js';
import { recomputeAll } from '../src/modules/reports/triage.service.js';
import { hashPassword } from '../src/modules/auth/password.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set (see backend/.env.example).');
const prisma = createPrismaClient(databaseUrl);

const SEED_PASSWORD = 'Password123!';
const DHAKA = { lat: 23.78, lng: 90.4 };
const DAY = 24 * 60 * 60 * 1000;
/** Seeded status changes are spaced this far apart. */
const HISTORY_STEP_MS = 6 * 60 * 60 * 1000;

const CATEGORIES = [
  { name: 'Roads & Potholes', icon: 'road' },
  { name: 'Street Lighting', icon: 'bulb' },
  { name: 'Garbage & Sanitation', icon: 'trash' },
  { name: 'Water & Drainage', icon: 'droplet' },
  { name: 'Public Safety', icon: 'shield' },
  { name: 'Parks & Greenery', icon: 'tree' },
  { name: 'Electricity', icon: 'zap' },
];

const DEPARTMENTS = [
  { name: 'Public Works Department', contactEmail: 'publicworks@city.gov' },
  { name: 'Sanitation Department', contactEmail: 'sanitation@city.gov' },
  { name: 'Water & Sewerage Authority', contactEmail: 'water@city.gov' },
  { name: 'Electricity Board', contactEmail: 'power@city.gov' },
  { name: 'Parks & Recreation', contactEmail: 'parks@city.gov' },
];

// Curated, topical stock photos per category (Unsplash) so seeded reports look
// like real civic issues instead of random stock landscapes.
const CATEGORY_PHOTOS: Record<string, string[]> = {
  'Roads & Potholes': [
    '1657811146537-90d7d8133224',
    '1560782202-154b39d57ef2',
    '1739517747161-fe59efffe64b',
  ],
  'Street Lighting': [
    '1782821826858-9cf8296f3ca2',
    '1675196395051-cea90e1642b2',
    '1762120658004-db6e194ea40e',
  ],
  'Garbage & Sanitation': [
    '1762805545352-4ac5355b0f0b',
    '1621408422423-4392b2711f69',
    '1580767114670-c778cc443675',
  ],
  'Water & Drainage': [
    '1657069345471-c54f2432b79c',
    '1609520778163-a16fb3862581',
    '1621871567192-e29a9b8b5aee',
  ],
  'Public Safety': [
    '1604716053460-3f66248bf8de',
    '1517776832751-0a7e6993de03',
    '1543097840-fc84594dd9e6',
  ],
  'Parks & Greenery': [
    '1445937888010-cc262f556033',
    '1595183670211-2b42f6663bf7',
    '1604606672490-5597473d8a69',
  ],
  Electricity: [
    '1554735231-2250c114a31d',
    '1574173799345-e672ea143892',
    '1473341304170-971dccb5ac1e',
  ],
};

/** The element at `i`, wrapping around, for deterministic seed rotation. */
function pick<T>(list: readonly T[], i: number): T {
  const item = list[i % list.length];
  if (item === undefined) throw new Error('pick() needs a non-empty list');
  return item;
}

function photoFor(categoryName: string, n: number): string {
  const pool = CATEGORY_PHOTOS[categoryName] ?? CATEGORY_PHOTOS['Roads & Potholes'] ?? [];
  const id = pick(pool, n);
  return `https://images.unsplash.com/photo-${id}?w=800&h=600&fit=crop&auto=format&q=70`;
}

// Canonical paths through the §26 state machine for building histories.
function pathTo(target: ReportStatus): ReportStatus[] {
  const linear: ReportStatus[] = [
    'SUBMITTED',
    'UNDER_REVIEW',
    'VERIFIED',
    'ASSIGNED',
    'IN_PROGRESS',
    'RESOLVED',
  ];
  if (linear.includes(target)) return linear.slice(0, linear.indexOf(target) + 1);
  if (target === 'REJECTED') return ['SUBMITTED', 'UNDER_REVIEW', 'REJECTED'];
  if (target === 'DUPLICATE') return ['SUBMITTED', 'DUPLICATE'];
  if (target === 'NEEDS_MORE_INFO') return ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_MORE_INFO'];
  return ['SUBMITTED'];
}

const ASSIGNED_STATES: ReportStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'];

// 25 reports: titles + statuses chosen for a realistic spread.
const STATUS_PLAN: ReportStatus[] = [
  'SUBMITTED',
  'SUBMITTED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'UNDER_REVIEW',
  'VERIFIED',
  'VERIFIED',
  'ASSIGNED',
  'ASSIGNED',
  'IN_PROGRESS',
  'IN_PROGRESS',
  'IN_PROGRESS',
  'RESOLVED',
  'RESOLVED',
  'RESOLVED',
  'RESOLVED',
  'REJECTED',
  'REJECTED',
  'DUPLICATE',
  'NEEDS_MORE_INFO',
  'SUBMITTED',
  'VERIFIED',
  'IN_PROGRESS',
  'RESOLVED',
  'ASSIGNED',
];
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'urgent'];
// Titles grouped by category so each report's title, category, and photo agree.
const CATEGORY_TITLES: Record<string, string[]> = {
  'Roads & Potholes': [
    'Large pothole on the main road',
    'Cracked road near the school',
    'Faded pedestrian crossing',
    'Sunken road after the rains',
  ],
  'Street Lighting': [
    'Streetlight out for a week',
    'Streetlight flickering at night',
    'Dim lighting in the park',
    'Leaning, damaged lamp post',
  ],
  'Garbage & Sanitation': [
    'Overflowing garbage bin',
    'Garbage not collected',
    'Illegal dumping by the canal',
    'Litter piling up at the corner',
  ],
  'Water & Drainage': [
    'Blocked drain causing flooding',
    'Water main burst',
    'Sewage leak on the street',
    'Stagnant water breeding mosquitoes',
  ],
  'Public Safety': [
    'Graffiti on a public wall',
    'Broken footpath railing',
    'Missing manhole cover',
    'Loose paving stones on the walkway',
  ],
  'Parks & Greenery': [
    'Park bench broken',
    'Fallen tree branch on the path',
    'Overgrown bushes blocking the trail',
    'Damaged playground equipment',
  ],
  Electricity: [
    'Exposed electrical wire',
    'Sparking utility pole',
    'Frequent power cuts on the block',
    'Sagging power line over the road',
  ],
};

async function reset(): Promise<void> {
  // Reports cascade to images/comments/votes/subscriptions/history/assignments/
  // notifications; refresh tokens cascade with users.
  await prisma.report.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.category.deleteMany();
}

async function main(): Promise<void> {
  await reset();
  const passwordHash = await hashPassword(SEED_PASSWORD);

  const categories = await Promise.all(CATEGORIES.map((c) => prisma.category.create({ data: c })));
  const departments = await Promise.all(
    DEPARTMENTS.map((d) => prisma.department.create({ data: d })),
  );

  await prisma.user.create({
    data: { name: 'Sara Super', email: 'super@civicfix.local', passwordHash, role: 'super_admin' },
  });
  const admin = await prisma.user.create({
    data: { name: 'Adam Admin', email: 'admin@civicfix.local', passwordHash, role: 'admin' },
  });
  const worker1 = await prisma.user.create({
    data: {
      name: 'Wendy Works',
      email: 'worker.publicworks@civicfix.local',
      passwordHash,
      role: 'department_worker',
      departmentId: pick(departments, 0).id,
    },
  });
  await prisma.user.create({
    data: {
      name: 'Sam Sanitation',
      email: 'worker.sanitation@civicfix.local',
      passwordHash,
      role: 'department_worker',
      departmentId: pick(departments, 1).id,
    },
  });
  const citizens = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      prisma.user.create({
        data: { name: `Citizen ${i + 1}`, email: `citizen${i + 1}@civicfix.local`, passwordHash },
      }),
    ),
  );

  const changerFor = (status: ReportStatus): string =>
    status === 'IN_PROGRESS' || status === 'RESOLVED' ? worker1.id : admin.id;

  const now = Date.now();
  let firstResolvedId: string | null = null;
  const reportIds: string[] = [];

  for (let i = 0; i < STATUS_PLAN.length; i++) {
    const status = pick(STATUS_PLAN, i);
    const category = pick(categories, i);
    const catTitles = CATEGORY_TITLES[category.name] ?? ['Civic issue'];
    const title = pick(catTitles, Math.floor(i / categories.length));
    const reporter = pick(citizens, i);
    const createdAt = new Date(now - (STATUS_PLAN.length - i) * 2 * DAY);
    const assigned = ASSIGNED_STATES.includes(status);
    const dept = pick(departments, i);
    // Status history chain (BR-009 / STAT-002), one step every HISTORY_STEP_MS.
    const chain = pathTo(status);
    const stepTime = (to: ReportStatus) =>
      new Date(createdAt.getTime() + chain.indexOf(to) * HISTORY_STEP_MS);
    // Resolved when the history says so: report pages and scorecards read this.
    const resolvedAt = status === 'RESOLVED' ? stepTime('RESOLVED') : null;

    const report = await prisma.report.create({
      data: {
        userId: reporter.id,
        title,
        description: `${title} reported by a resident. Please look into this as soon as possible.`,
        categoryId: category.id,
        severity: pick(SEVERITIES, i),
        latitude: DHAKA.lat + (i % 7) * 0.004 - 0.014,
        longitude: DHAKA.lng + (i % 5) * 0.004 - 0.008,
        address: `${100 + i} Sample Road, Dhaka`,
        status,
        createdAt,
        resolvedAt,
        assignedDepartmentId: assigned ? dept.id : null,
        internalNote: status === 'REJECTED' ? 'Not a valid civic issue after review.' : null,
        duplicateOfReportId: status === 'DUPLICATE' && reportIds[0] ? reportIds[0] : null,
      },
    });
    reportIds.push(report.id);
    if (status === 'RESOLVED' && !firstResolvedId) firstResolvedId = report.id;

    await prisma.statusHistory.createMany({
      data: chain.map((to, idx) => ({
        reportId: report.id,
        oldStatus: idx === 0 ? null : chain[idx - 1],
        newStatus: to,
        changedBy: idx === 0 ? reporter.id : changerFor(to),
        note: idx === 0 ? 'Report submitted.' : null,
        createdAt: new Date(createdAt.getTime() + idx * HISTORY_STEP_MS),
      })),
    });

    // Owner subscription (§13.5).
    await prisma.reportSubscription.create({
      data: { reportId: report.id, userId: reporter.id, source: 'owner' },
    });

    // Current assignment for assigned/in-progress/resolved reports.
    if (assigned) {
      await prisma.reportAssignment.create({
        data: {
          reportId: report.id,
          departmentId: dept.id,
          assignedBy: admin.id,
          isCurrent: true,
          // When the history says it was assigned: scorecards time from this.
          createdAt: stepTime('ASSIGNED'),
        },
      });
    }

    // Images: the first resolved report gets before/after; others get evidence.
    if (report.id === firstResolvedId) {
      await prisma.reportImage.createMany({
        data: [
          {
            reportId: report.id,
            imageUrl: photoFor(category.name, 0),
            imageType: 'before',
            uploadedBy: reporter.id,
          },
          {
            reportId: report.id,
            imageUrl: photoFor(category.name, 1),
            imageType: 'after',
            uploadedBy: worker1.id,
          },
        ],
      });
    } else {
      await prisma.reportImage.create({
        data: {
          reportId: report.id,
          imageUrl: photoFor(category.name, i),
          imageType: 'evidence',
          uploadedBy: reporter.id,
        },
      });
    }
  }

  // Sample comments on the first few reports.
  for (let i = 0; i < 6; i++) {
    const commenter = pick(citizens, i + 1);
    await prisma.comment.create({
      data: {
        reportId: pick(reportIds, i),
        userId: commenter.id,
        content: 'I have noticed this too, it really needs attention.',
      },
    });
  }

  // Sample votes: each of the first 12 reports gets a few upvotes and confirms;
  // confirms add a confirm-sourced subscription (BR-016).
  for (let i = 0; i < 12; i++) {
    const reportId = pick(reportIds, i);
    const upvoters = citizens.slice(0, (i % 4) + 1);
    await prisma.vote.createMany({
      data: upvoters.map((u) => ({ reportId, userId: u.id, voteType: 'upvote' as const })),
      skipDuplicates: true,
    });
    const confirmers = citizens.slice(0, (i % 3) + 1);
    await prisma.vote.createMany({
      data: confirmers.map((u) => ({ reportId, userId: u.id, voteType: 'confirm' as const })),
      skipDuplicates: true,
    });
    await prisma.reportSubscription.createMany({
      data: confirmers.map((u) => ({ reportId, userId: u.id, source: 'confirm' as const })),
      skipDuplicates: true,
    });
  }

  console.log('Seed complete:');
  // Trust scores and priority anchors from the seeded histories and votes (F1).
  await recomputeAll(prisma);

  console.log(`  users: 1 super admin, 1 admin, 2 workers, ${citizens.length} citizens`);
  console.log(`  categories: ${categories.length}, departments: ${departments.length}`);
  console.log(`  reports: ${reportIds.length} (with histories, subscriptions, votes, comments)`);
  console.log(`  login with any seeded email + password: ${SEED_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
