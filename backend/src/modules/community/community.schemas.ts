/** Request schemas for the community routes (SRS v1.1 §9.5/9.6). */
import { z } from 'zod';
import { zodMessage } from '../../lib/messages.js';

export const commentSchema = z.object({
  content: z.string().min(1, zodMessage('comment.empty')).max(2000),
});
