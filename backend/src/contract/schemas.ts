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

export const AnalyticsSummarySchema = z
  .strictObject({
    totalReports: count,
    byStatus: z.record(ReportStatusSchema, count),
    bySeverity: z.record(SeveritySchema, count),
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
