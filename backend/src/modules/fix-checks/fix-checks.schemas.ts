/** Request schemas for fix checks (F3). */
import { z } from 'zod';
import { FixVerdict } from '../../generated/prisma/enums.js';

/** Multipart fields of a check; the photo is the `photo` file field. */
export const fixCheckSchema = z.object({
  verdict: z.enum(FixVerdict),
});
