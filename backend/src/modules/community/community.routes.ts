/**
 * Community routes (SRS v1.1 §9.5/9.6). The nested router is mounted on the
 * same /reports prefix as the reports router (distinct sub-paths, no
 * conflict); the comments router handles top-level /comments/:id deletes.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { optionalAuth, requireAuth } from '../../middleware/require-auth.js';
import { commentLimiter } from '../../middleware/rate-limit.js';
import * as comments from './comments.service.js';
import * as votes from './votes.service.js';
import * as subscriptions from './subscriptions.service.js';

const commentSchema = z.object({ content: z.string().min(1, 'Comment cannot be empty.').max(2000) });

function parseComment(body: unknown): { content: string } {
  const result = commentSchema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
  }
  return result.data;
}

// Nested under /api/v1/reports
export const communityRouter = Router();

communityRouter.get(
  '/:id/comments',
  optionalAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { comments: await comments.listComments(req.params.id) });
  }),
);

communityRouter.post(
  '/:id/comments',
  requireAuth,
  commentLimiter,
  asyncHandler(async (req, res) => {
    const { content } = parseComment(req.body);
    const comment = await comments.addComment(req.params.id, req.user!.id, content);
    sendSuccess(res, { comment }, 201);
  }),
);

// Votes — upvote / confirm / false-report (§9.6)
communityRouter.post(
  '/:id/upvote',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await votes.castVote(req.params.id, req.user!.id, 'upvote'));
  }),
);
communityRouter.delete(
  '/:id/upvote',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await votes.removeVote(req.params.id, req.user!.id, 'upvote'));
  }),
);
communityRouter.post(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await votes.castVote(req.params.id, req.user!.id, 'confirm'));
  }),
);
communityRouter.delete(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await votes.removeVote(req.params.id, req.user!.id, 'confirm'));
  }),
);
communityRouter.post(
  '/:id/false-report',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await votes.castVote(req.params.id, req.user!.id, 'false_report'));
  }),
);

// Follow / unfollow (NOTIF-007)
communityRouter.post(
  '/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptions.follow(req.params.id, req.user!.id));
  }),
);
communityRouter.delete(
  '/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await subscriptions.unfollow(req.params.id, req.user!.id));
  }),
);

// Top-level: DELETE /api/v1/comments/:id
export const commentsRouter = Router();
commentsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await comments.deleteComment(req.params.id, req.user!);
    sendSuccess(res, { deleted: true });
  }),
);
