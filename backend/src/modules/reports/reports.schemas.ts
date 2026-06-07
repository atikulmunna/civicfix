/**
 * Zod schemas for the reports module (SEC-006). Create/update arrive as
 * multipart form fields, so numeric values are coerced from strings.
 */
import { z } from 'zod';

const severity = z.enum(['low', 'medium', 'high', 'urgent']);
const status = z.enum([
  'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS',
  'RESOLVED', 'REJECTED', 'DUPLICATE', 'NEEDS_MORE_INFO', 'ARCHIVED',
]);

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);

export const createReportSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(180),
  description: z.string().trim().min(10, 'Description must be at least 10 characters.'),
  categoryId: z.string().uuid('A valid category is required.'),
  severity,
  latitude,
  longitude,
  address: z.string().trim().max(500).optional(),
  landmark: z.string().trim().max(255).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

// Edit allows changing the descriptive fields and location; at least one.
export const updateReportSchema = z
  .object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10),
    categoryId: z.string().uuid(),
    severity,
    latitude,
    longitude,
    address: z.string().trim().max(500).nullable(),
    landmark: z.string().trim().max(255).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });
export type UpdateReportInput = z.infer<typeof updateReportSchema>;

export const listReportsSchema = z.object({
  categoryId: z.string().uuid().optional(),
  status: status.optional(),
  severity: severity.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(['newest', 'oldest', 'priority', 'most_confirmed']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListReportsInput = z.infer<typeof listReportsSchema>;

export const nearbySchema = z.object({
  lat: latitude,
  lng: longitude,
  radius: z.coerce.number().positive().max(50000).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type NearbyInput = z.infer<typeof nearbySchema>;

// bbox=minLng,minLat,maxLng,maxLat
export const mapSchema = z.object({
  bbox: z
    .string()
    .transform((s, ctx) => {
      const parts = s.split(',').map(Number);
      if (parts.length !== 4 || parts.some(Number.isNaN)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox must be minLng,minLat,maxLng,maxLat.' });
        return z.NEVER;
      }
      const [minLng, minLat, maxLng, maxLat] = parts;
      return { minLng, minLat, maxLng, maxLat };
    }),
  status: status.optional(),
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(2000).default(1000),
});
export type MapInput = z.infer<typeof mapSchema>;

export const checkDuplicatesSchema = z.object({
  categoryId: z.string().uuid('A valid category is required.'),
  latitude,
  longitude,
  radius: z.coerce.number().positive().max(2000).optional(),
});
export type CheckDuplicatesInput = z.infer<typeof checkDuplicatesSchema>;
