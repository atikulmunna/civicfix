/**
 * Response schemas: what the API sends, as JSON on the wire (R10).
 *
 * These are the single source of truth for response shapes. They feed the
 * OpenAPI document (src/contract/openapi.ts, published as openapi.json) and,
 * in tests, every JSON response is checked against them
 * (src/contract/validate.ts), so they cannot drift from the code.
 *
 * Resources are strict objects: an unexpected field (for example a column
 * leaking from a raw Prisma row) is a contract violation, not silently passed
 * through. Timestamps are ISO strings because that is what JSON carries.
 * `.meta({ id })` turns a schema into a named OpenAPI component.
 */
import { z } from 'zod';
import { ERROR_CODES } from '../lib/errors.js';
import {
  FixVerdict,
  ImageType,
  NotificationType,
  ReportStatus,
  Severity,
  UserRole,
} from '../generated/prisma/enums.js';

const id = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Enums (from the Prisma schema, so they follow the database)

export const RoleSchema = z.enum(UserRole).meta({ id: 'Role' });
export const ReportStatusSchema = z.enum(ReportStatus).meta({ id: 'ReportStatus' });
export const SeveritySchema = z.enum(Severity).meta({ id: 'Severity' });
export const ImageTypeSchema = z.enum(ImageType).meta({ id: 'ImageType' });
export const FixVerdictSchema = z.enum(FixVerdict).meta({ id: 'FixVerdict' });
export const NotificationTypeSchema = z.enum(NotificationType).meta({ id: 'NotificationType' });
export const ErrorCodeSchema = z.enum(ERROR_CODES).meta({ id: 'ErrorCode' });

// ---------------------------------------------------------------------------
// Users

const userShape = {
  id,
  name: z.string(),
  email: z.string(),
  role: RoleSchema,
  departmentId: id.nullable(),
  trustScore: z.number().int(),
  phone: z.string().nullable(),
  phoneIsPublic: z.boolean(),
  /** Set after an admin password reset; the user must choose a new password. */
  mustChangePassword: z.boolean(),
  createdAt: timestamp,
};

export const UserSchema = z
  .strictObject(userShape)
  .meta({ id: 'User', description: 'The signed-in user (auth and profile endpoints).' });

export const AdminUserSchema = z
  .strictObject({ ...userShape, isActive: z.boolean(), updatedAt: timestamp })
  .meta({ id: 'AdminUser', description: 'A user as listed and managed by admins.' });

// ---------------------------------------------------------------------------
// Catalog

export const CategorySchema = z
  .strictObject({
    id,
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: timestamp,
  })
  .meta({ id: 'Category' });

export const DepartmentSchema = z
  .strictObject({
    id,
    name: z.string(),
    description: z.string().nullable(),
    contactEmail: z.string().nullable(),
    phone: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: timestamp,
  })
  .meta({ id: 'Department' });

// ---------------------------------------------------------------------------
// Reports

export const VoteCountsSchema = z
  .strictObject({ upvotes: count, confirms: count, falseReports: count })
  .meta({ id: 'VoteCounts' });

export const ReportImageSchema = z
  .strictObject({ id, imageUrl: z.string(), imageType: ImageTypeSchema, createdAt: timestamp })
  .meta({ id: 'ReportImage' });

/** The signed-in viewer's own votes and follow on a report. */
export const ReportViewerStateSchema = z
  .strictObject({
    upvoted: z.boolean(),
    confirmed: z.boolean(),
    flagged: z.boolean(),
    following: z.boolean(),
  })
  .meta({ id: 'ReportViewerState' });

export const ReportSchema = z
  .strictObject({
    id,
    userId: id,
    title: z.string(),
    description: z.string(),
    categoryId: id,
    category: z.strictObject({ id, name: z.string(), icon: z.string().nullable() }).optional(),
    status: ReportStatusSchema,
    severity: SeveritySchema,
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().nullable(),
    landmark: z.string().nullable(),
    assignedDepartmentId: id.nullable(),
    priorityScore: z.number().int(),
    duplicateOfReportId: id.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAt: timestamp.nullable(),
    images: z.array(ReportImageSchema).optional(),
    internalNote: z
      .string()
      .nullable()
      .optional()
      .meta({ description: 'Only present for admins and department staff (BR-012).' }),
    counts: VoteCountsSchema.optional().meta({
      description: 'Present on report detail and list endpoints.',
    }),
    viewer: ReportViewerStateSchema.optional().meta({
      description: 'Your own votes and follow; on report detail when signed in.',
    }),
    distanceM: z
      .number()
      .nonnegative()
      .optional()
      .meta({ description: 'Distance in metres; present on nearby and duplicate searches.' }),
  })
  .meta({ id: 'Report' });

export const MapMarkerSchema = z
  .strictObject({
    id,
    title: z.string(),
    status: ReportStatusSchema,
    severity: SeveritySchema,
    categoryId: id,
    latitude: z.number(),
    longitude: z.number(),
  })
  .meta({ id: 'MapMarker', description: 'Lightweight report marker for the map viewport.' });

export const StatusHistoryEntrySchema = z
  .strictObject({
    id,
    oldStatus: ReportStatusSchema.nullable(),
    newStatus: ReportStatusSchema,
    note: z.string().nullable(),
    changedBy: z.strictObject({ id, name: z.string(), role: RoleSchema }),
    createdAt: timestamp,
  })
  .meta({ id: 'StatusHistoryEntry' });

/** Why an open report scores what it does today (F1); see modules/reports/priority.ts. */
export const PriorityExplanationSchema = z
  .strictObject({
    severity: z.number().int(),
    confirmations: z.number().int(),
    waiting: z.number().int(),
    flags: z.number().int(),
    reporter: z.number().int(),
    total: z.number().int(),
    daysOpen: z.number().int(),
    inputs: z.strictObject({
      severity: SeveritySchema,
      confirms: count,
      falseReports: count,
      reporterTrust: z.number().int(),
    }),
  })
  .meta({ id: 'PriorityExplanation' });

// ---------------------------------------------------------------------------
// Community and notifications

export const CommentSchema = z
  .strictObject({
    id,
    reportId: id,
    content: z.string(),
    author: z.strictObject({ id, name: z.string() }),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .meta({ id: 'Comment' });

// ---------------------------------------------------------------------------
// Fix checks (F3)

export const FixCheckSchema = z
  .strictObject({
    id,
    verdict: FixVerdictSchema,
    imageUrl: z.string(),
    author: z.strictObject({ id, name: z.string() }),
    resolvedAt: timestamp.meta({
      description: 'The fix this checks: when the report was marked resolved.',
    }),
    createdAt: timestamp,
  })
  .meta({ id: 'FixCheck', description: "A resident's check of a fix, with a photo of it now." });

export const FixChecksSchema = z
  .strictObject({
    disputesToReopen: count.meta({
      description: 'Disputes from different residents that reopen a fix.',
    }),
    current: z
      .strictObject({ resolvedAt: timestamp, confirmed: count, disputed: count })
      .nullable()
      .meta({ description: 'While the report is resolved: its fix and the tally so far.' }),
    checks: z
      .array(FixCheckSchema)
      .meta({ description: 'Checks of every fix so far, newest first, at most 50.' }),
    total: count,
    viewer: z
      .strictObject({ verdict: FixVerdictSchema.nullable(), canCheck: z.boolean() })
      .optional()
      .meta({ description: 'Signed in: your check of the current fix, and whether you may.' }),
  })
  .meta({ id: 'FixChecks' });

export const NotificationSchema = z
  .strictObject({
    id,
    userId: id,
    reportId: id.nullable(),
    title: z.string(),
    message: z.string(),
    type: NotificationTypeSchema,
    isRead: z.boolean(),
    createdAt: timestamp,
  })
  .meta({ id: 'Notification' });

// ---------------------------------------------------------------------------
// Analytics

/**
 * A count for every value of an enum, all present. Spelled out as properties
 * (rather than z.record over the enum) so OpenAPI tools see each key as
 * required; record keys reach generated types as an open string index.
 */
function countsFor<const T extends string>(values: readonly T[]) {
  // Object.fromEntries widens keys to string; they are exactly `values`.
  const shape = Object.fromEntries(values.map((v) => [v, count])) as Record<T, typeof count>;
  return z.strictObject(shape);
}

export const AnalyticsSummarySchema = z
  .strictObject({
    totalReports: count,
    byStatus: countsFor(Object.values(ReportStatus)),
    bySeverity: countsFor(Object.values(Severity)),
    resolvedCount: count,
    resolutionRate: z.number().min(0).max(1),
    avgResolutionHours: z.number().nullable(),
    unresolvedHighPriority: count,
    monthlyTrends: z.array(z.strictObject({ month: z.string(), count })),
  })
  .meta({ id: 'AnalyticsSummary' });

export const CategoryAnalyticsSchema = z
  .strictObject({ categoryId: id, name: z.string(), total: count, resolved: count })
  .meta({ id: 'CategoryAnalytics' });

export const DepartmentAnalyticsSchema = z
  .strictObject({
    departmentId: id,
    name: z.string(),
    total: count,
    openAssignments: count,
    resolved: count,
    avgResolutionHours: z.number().nullable(),
  })
  .meta({ id: 'DepartmentAnalytics' });

// ---------------------------------------------------------------------------
// Public department scorecards (F2); see modules/scorecards/scorecard.ts

const rate = z.number().min(0).max(1);
const hours = z.number().nonnegative();

export const OverdueReportSchema = z
  .strictObject({
    reportId: id,
    title: z.string(),
    severity: SeveritySchema,
    status: ReportStatusSchema,
    assignedAt: timestamp,
    dueAt: timestamp,
    hoursOverdue: z.number().positive(),
  })
  .meta({ id: 'OverdueReport' });

export const DepartmentScorecardSchema = z
  .strictObject({
    departmentId: id,
    name: z.string(),
    assigned: count,
    resolved: count,
    resolutionRate: rate.nullable(),
    medianResponseHours: hours.nullable(),
    medianResolveHours: hours.nullable(),
    respondedOnTimeRate: rate.nullable(),
    resolvedOnTimeRate: rate.nullable(),
    overdueCount: count,
    overdue: z.array(OverdueReportSchema),
  })
  .meta({ id: 'DepartmentScorecard' });

export const ScorecardsSchema = z
  .strictObject({
    generatedAt: timestamp,
    windowDays: z.number().int().positive(),
    targets: z.strictObject({
      response: countsFor(Object.values(Severity)),
      resolution: countsFor(Object.values(Severity)),
    }),
    departments: z.array(DepartmentScorecardSchema),
  })
  .meta({ id: 'Scorecards', description: 'Target hours by severity; rates are 0 to 1.' });

// ---------------------------------------------------------------------------
// Hotspots and recurring problems (F4); see modules/hotspots/hotspot.ts

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const HotspotSchema = z
  .strictObject({
    latitude,
    longitude,
    radiusM: count.meta({ description: 'From the centre to its farthest report.' }),
    reportCount: count,
    openCount: count,
    categories: z
      .array(z.strictObject({ categoryId: id, name: z.string(), count }))
      .meta({ description: 'Most reported first.' }),
    recurring: z.boolean().meta({
      description: 'A problem of one kind was reported here again after an earlier one was fixed.',
    }),
    latestReportAt: timestamp,
    reports: z
      .array(
        z.strictObject({ id, title: z.string(), status: ReportStatusSchema, createdAt: timestamp }),
      )
      .meta({ description: 'Newest first, at most 10.' }),
  })
  .meta({ id: 'Hotspot' });

export const HotspotsSchema = z
  .strictObject({
    generatedAt: timestamp,
    windowDays: z.number().int().positive(),
    radiusM: z.number().int().positive(),
    minReports: z.number().int().positive(),
    hotspots: z.array(HotspotSchema).meta({ description: 'Most reports first, at most 50.' }),
  })
  .meta({ id: 'Hotspots' });

export const RecurrenceSchema = z
  .strictObject({
    radiusM: z.number().int().positive(),
    total: count,
    earlier: z
      .array(
        z.strictObject({
          id,
          title: z.string(),
          status: ReportStatusSchema,
          resolvedAt: timestamp,
          distanceM: count,
        }),
      )
      .meta({ description: 'Most recently fixed first, at most 10.' }),
  })
  .meta({
    id: 'Recurrence',
    description: 'Earlier reports of the same kind nearby, fixed before this one was made.',
  });

// ---------------------------------------------------------------------------
// Envelopes (SRS v1.1 §22.1)

const pageFields = {
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: count,
  totalPages: count,
};

/** A page of `item`s, registered as the component `id`. */
export function pageOf<T extends z.ZodType>(item: T, componentId: string) {
  return z.strictObject({ items: z.array(item), ...pageFields }).meta({ id: componentId });
}

export const ReportPageSchema = pageOf(ReportSchema, 'ReportPage');
export const AdminUserPageSchema = pageOf(AdminUserSchema, 'AdminUserPage');
export const NotificationPageSchema = z
  .strictObject({ items: z.array(NotificationSchema), unreadCount: count, ...pageFields })
  .meta({ id: 'NotificationPage' });

/** The success envelope around a route's `data`. */
export function successEnvelope<T extends z.ZodType>(data: T) {
  return z.strictObject({ success: z.literal(true), data });
}

export const ErrorEnvelopeSchema = z
  .strictObject({
    success: z.literal(false),
    message: z.string(),
    code: ErrorCodeSchema,
    details: z.unknown().optional(),
    requestId: z
      .string()
      .optional()
      .meta({ description: 'On 500s: quote it when reporting the problem.' }),
  })
  .meta({ id: 'ErrorEnvelope' });
