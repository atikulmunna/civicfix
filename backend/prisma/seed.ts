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
import { PrismaClient, type ReportStatus, type Severity } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password.js';

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Password123!';
const DHAKA = { lat: 23.78, lng: 90.4 };
const DAY = 24 * 60 * 60 * 1000;

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

// Canonical paths through the §26 state machine for building histories.
function pathTo(target: ReportStatus): ReportStatus[] {
  const linear: ReportStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'];
  if (linear.includes(target)) return linear.slice(0, linear.indexOf(target) + 1);
  if (target === 'REJECTED') return ['SUBMITTED', 'UNDER_REVIEW', 'REJECTED'];
  if (target === 'DUPLICATE') return ['SUBMITTED', 'DUPLICATE'];
  if (target === 'NEEDS_MORE_INFO') return ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_MORE_INFO'];
  return ['SUBMITTED'];
}

const ASSIGNED_STATES: ReportStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'];

// 25 reports: titles + statuses chosen for a realistic spread.
const STATUS_PLAN: ReportStatus[] = [
  'SUBMITTED', 'SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'UNDER_REVIEW',
  'VERIFIED', 'VERIFIED', 'ASSIGNED', 'ASSIGNED', 'IN_PROGRESS',
  'IN_PROGRESS', 'IN_PROGRESS', 'RESOLVED', 'RESOLVED', 'RESOLVED',
  'RESOLVED', 'REJECTED', 'REJECTED', 'DUPLICATE', 'NEEDS_MORE_INFO',
  'SUBMITTED', 'VERIFIED', 'IN_PROGRESS', 'RESOLVED', 'ASSIGNED',
];
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'urgent'];
const TITLES = [
  'Large pothole on the main road', 'Streetlight out for a week', 'Overflowing garbage bin',
  'Blocked drain causing flooding', 'Broken footpath railing', 'Fallen tree branch on path',
  'Exposed electrical wire', 'Cracked road near school', 'Dim lighting in the park',
  'Illegal dumping by the canal', 'Sewage leak on the street', 'Missing manhole cover',
  'Faded pedestrian crossing', 'Water main burst', 'Damaged bus stop shelter',
  'Graffiti on public wall', 'Stagnant water breeding mosquitoes', 'Loose paving stones',
  'Duplicate pothole report', 'Need more info: vague location', 'Garbage not collected',
  'Traffic signal malfunction', 'Park bench broken', 'Drain cleared after report',
  'Streetlight flickering at night',
];

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

  const categories = await Promise.all(
    CATEGORIES.map((c) => prisma.category.create({ data: c })),
  );
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
      name: 'Wendy Works', email: 'worker.publicworks@civicfix.local', passwordHash,
      role: 'department_worker', departmentId: departments[0].id,
    },
  });
  await prisma.user.create({
    data: {
      name: 'Sam Sanitation', email: 'worker.sanitation@civicfix.local', passwordHash,
      role: 'department_worker', departmentId: departments[1].id,
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
    const status = STATUS_PLAN[i];
    const category = categories[i % categories.length];
    const reporter = citizens[i % citizens.length];
    const createdAt = new Date(now - (STATUS_PLAN.length - i) * 2 * DAY);
    const assigned = ASSIGNED_STATES.includes(status);
    const dept = departments[i % departments.length];
    const resolvedAt = status === 'RESOLVED' ? new Date(createdAt.getTime() + 3 * DAY) : null;

    const report = await prisma.report.create({
      data: {
        userId: reporter.id,
        title: TITLES[i] ?? `Civic issue #${i + 1}`,
        description: `${TITLES[i] ?? 'Issue'} reported by a resident. Please look into this as soon as possible.`,
        categoryId: category.id,
        severity: SEVERITIES[i % SEVERITIES.length],
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

    // Status history chain (BR-009 / STAT-002).
    const chain = pathTo(status);
    await prisma.statusHistory.createMany({
      data: chain.map((to, idx) => ({
        reportId: report.id,
        oldStatus: idx === 0 ? null : chain[idx - 1],
        newStatus: to,
        changedBy: idx === 0 ? reporter.id : changerFor(to),
        note: idx === 0 ? 'Report submitted.' : null,
        createdAt: new Date(createdAt.getTime() + idx * 6 * 60 * 60 * 1000),
      })),
    });

    // Owner subscription (§13.5).
    await prisma.reportSubscription.create({
      data: { reportId: report.id, userId: reporter.id, source: 'owner' },
    });

    // Current assignment for assigned/in-progress/resolved reports.
    if (assigned) {
      await prisma.reportAssignment.create({
        data: { reportId: report.id, departmentId: dept.id, assignedBy: admin.id, isCurrent: true },
      });
    }

    // Images: the first resolved report gets before/after; others get evidence.
    if (report.id === firstResolvedId) {
      await prisma.reportImage.createMany({
        data: [
          { reportId: report.id, imageUrl: `https://picsum.photos/seed/before${i}/800/600`, imageType: 'before', uploadedBy: reporter.id },
          { reportId: report.id, imageUrl: `https://picsum.photos/seed/after${i}/800/600`, imageType: 'after', uploadedBy: worker1.id },
        ],
      });
    } else {
      await prisma.reportImage.create({
        data: { reportId: report.id, imageUrl: `https://picsum.photos/seed/rep${i}/800/600`, imageType: 'evidence', uploadedBy: reporter.id },
      });
    }
  }

  // Sample comments on the first few reports.
  for (let i = 0; i < 6; i++) {
    const commenter = citizens[(i + 1) % citizens.length];
    await prisma.comment.create({
      data: {
        reportId: reportIds[i],
        userId: commenter.id,
        content: 'I have noticed this too — it really needs attention.',
      },
    });
  }

  // Sample votes: each of the first 12 reports gets a few upvotes and confirms;
  // confirms add a confirm-sourced subscription (BR-016).
  for (let i = 0; i < 12; i++) {
    const reportId = reportIds[i];
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
  console.log(`  users: 1 super admin, 1 admin, 2 workers, ${citizens.length} citizens`);
  console.log(`  categories: ${categories.length}, departments: ${departments.length}`);
  console.log(`  reports: ${reportIds.length} (with histories, subscriptions, votes, comments)`);
  console.log(`  login with any seeded email + password: ${SEED_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
