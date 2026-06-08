/**
 * Zod schemas for the admin/department workflow (SRS v1.1 §9.7/9.9).
 */
import { z } from 'zod';

const status = z.enum([
  'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS',
  'RESOLVED', 'REJECTED', 'DUPLICATE', 'NEEDS_MORE_INFO', 'ARCHIVED',
]);
const severity = z.enum(['low', 'medium', 'high', 'urgent']);

const note = z.string().trim().max(2000).optional();

// Generic status change (validated against §26 in the service).
export const statusSchema = z.object({
  status,
  note,
  internalNote: z.string().trim().max(2000).optional(),
  duplicateOfReportId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
export type StatusInput = z.infer<typeof statusSchema>;

export const assignSchema = z.object({
  departmentId: z.string().uuid('A valid department is required.'),
  note,
});
export type AssignInput = z.infer<typeof assignSchema>;

export const resolveSchema = z.object({ note });
export type ResolveInput = z.infer<typeof resolveSchema>;

export const duplicateSchema = z.object({
  duplicateOfReportId: z.string().uuid('A valid original report is required.'),
  note,
});
export type DuplicateInput = z.infer<typeof duplicateSchema>;

export const adminListSchema = z.object({
  status: status.optional(),
  categoryId: z.string().uuid().optional(),
  severity: severity.optional(),
  assignedDepartmentId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest', 'priority']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type AdminListInput = z.infer<typeof adminListSchema>;

export const deptListSchema = z.object({
  status: status.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type DeptListInput = z.infer<typeof deptListSchema>;
