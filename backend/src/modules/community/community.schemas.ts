/** Request schemas for the community routes (SRS v1.1 §9.5/9.6). */
import { z } from 'zod';

export const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty.').max(2000),
});
