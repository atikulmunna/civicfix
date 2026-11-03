/** Request schemas for the notification routes (SRS v1.1 §9.10). */
import { z } from 'zod';

export const listNotificationsSchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
