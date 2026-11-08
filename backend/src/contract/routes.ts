/**
 * The API contract (R10): every JSON endpoint, its access rule, its inputs
 * (the same Zod schemas the routes validate with) and the `data` it returns
 * inside the success envelope.
 *
 * Paths use OpenAPI syntax (`{id}`); src/contract/validate.ts maps Express
 * paths (`:id`) onto them. Adding an endpoint without an entry here fails the
 * test suite, because tests check every JSON response against this table.
 */
import { z } from 'zod';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  departmentCreateSchema,
  departmentUpdateSchema,
  listUsersSchema,
  userRoleSchema,
  userStatusSchema,
} from '../modules/admin/admin-crud.schemas.js';
import {
  adminListSchema,
  assignSchema,
  deptListSchema,
  duplicateSchema,
  resolveSchema,
  statusSchema,
} from '../modules/admin/workflow.schemas.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../modules/auth/auth.schemas.js';
import { commentSchema } from '../modules/community/community.schemas.js';
import { fixCheckSchema } from '../modules/fix-checks/fix-checks.schemas.js';
import { listNotificationsSchema } from '../modules/notifications/notifications.schemas.js';
import {
  checkDuplicatesSchema,
  createReportSchema,
  listReportsSchema,
  mapSchema,
  nearbySchema,
  updateReportSchema,
} from '../modules/reports/reports.schemas.js';
import { listMyReportsSchema, updateMeSchema } from '../modules/users/me.schemas.js';
import {
  AdminUserPageSchema,
  AdminUserSchema,
  AnalyticsSummarySchema,
  CategoryAnalyticsSchema,
  CategorySchema,
  CommentSchema,
  DepartmentAnalyticsSchema,
  FixChecksSchema,
  FixCheckSchema,
  HotspotsSchema,
  DepartmentSchema,
  MapMarkerSchema,
  PriorityExplanationSchema,
  RecurrenceSchema,
  NotificationPageSchema,
  ReportPageSchema,
  ReportSchema,
  ScorecardsSchema,
  StatusHistoryEntrySchema,
  UserSchema,
  VoteCountsSchema,
} from './schemas.js';

export type Method = 'get' | 'post' | 'patch' | 'delete';
type StaffRole = 'department_worker' | 'admin' | 'super_admin';

/**
 * Who may call it: anyone; anyone, with extras for signed-in users; any
 * signed-in user; or only the listed roles.
 */
export type Access = 'public' | 'optional' | 'user' | readonly StaffRole[];

export interface ContractRoute {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  access: Access;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  /** multipart/form-data body: its fields, and which file field it carries. */
  multipart?: { fields: z.ZodObject; files: 'images' | 'photo' };
  /** Success status (default 200). */
  status?: 200 | 201;
  /** The `data` member of the success envelope. */
  data: z.ZodType;
}

const ADMIN = ['admin', 'super_admin'] as const;
const STAFF = ['department_worker', 'admin', 'super_admin'] as const;

const idParams = z.object({ id: z.uuid() });
const catalogQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .meta({ description: 'Admins only: include disabled entries.' }),
});

const report = z.strictObject({ report: ReportSchema });
const user = z.strictObject({ user: UserSchema });
const adminUser = z.strictObject({ user: AdminUserSchema });
const category = z.strictObject({ category: CategorySchema });
const department = z.strictObject({ department: DepartmentSchema });
const voteResult = z.strictObject({ counts: VoteCountsSchema });
const followResult = z.strictObject({ following: z.boolean() });
const deleted = z.strictObject({ deleted: z.literal(true) });

export const routes: readonly ContractRoute[] = [
  // ---------------------------------------------------------------- health
  {
    method: 'get',
    path: '/health',
    summary: 'Liveness: the process is up (never touches the database).',
    tag: 'Health',
    access: 'public',
    data: z.strictObject({ status: z.literal('ok') }),
  },
  {
    method: 'get',
    path: '/health/ready',
    summary: 'Readiness: the database answers (503 SERVICE_UNAVAILABLE otherwise).',
    tag: 'Health',
    access: 'public',
    data: z.strictObject({
      status: z.literal('ready'),
      checks: z.strictObject({ database: z.literal('ok') }),
    }),
  },

  // ------------------------------------------------------------------ auth
  {
    method: 'post',
    path: '/api/v1/auth/register',
    summary: 'Create an account and sign in (sets the auth cookies).',
    tag: 'Auth',
    access: 'public',
    body: registerSchema,
    status: 201,
    data: user,
  },
  {
    method: 'post',
    path: '/api/v1/auth/login',
    summary: 'Sign in (sets the auth cookies).',
    tag: 'Auth',
    access: 'public',
    body: loginSchema,
    data: user,
  },
  {
    method: 'post',
    path: '/api/v1/auth/refresh',
    summary: 'Rotate the refresh token cookie and issue a new access token.',
    tag: 'Auth',
    access: 'public',
    data: z.strictObject({ refreshed: z.literal(true) }),
  },
  {
    method: 'post',
    path: '/api/v1/auth/logout',
    summary: 'Revoke the refresh token and clear the auth cookies.',
    tag: 'Auth',
    access: 'public',
    data: z.strictObject({ loggedOut: z.literal(true) }),
  },
  {
    method: 'get',
    path: '/api/v1/auth/me',
    summary: 'The signed-in user.',
    tag: 'Auth',
    access: 'user',
    data: user,
  },
  {
    method: 'post',
    path: '/api/v1/auth/change-password',
    summary: 'Change the password; revokes other sessions and issues a new one.',
    tag: 'Auth',
    access: 'user',
    body: changePasswordSchema,
    data: user,
  },

  // --------------------------------------------------------------- reports
  {
    method: 'post',
    path: '/api/v1/reports',
    summary: 'Create a report with 1 to 5 photos (multipart field `images`).',
    tag: 'Reports',
    access: 'user',
    multipart: { fields: createReportSchema, files: 'images' },
    status: 201,
    data: report,
  },
  {
    method: 'get',
    path: '/api/v1/reports',
    summary: 'List and filter reports.',
    tag: 'Reports',
    access: 'optional',
    query: listReportsSchema,
    data: ReportPageSchema,
  },
  {
    method: 'get',
    path: '/api/v1/reports/nearby',
    summary: 'Reports within a radius, nearest first.',
    tag: 'Reports',
    access: 'optional',
    query: nearbySchema,
    data: z.strictObject({ items: z.array(ReportSchema) }),
  },
  {
    method: 'get',
    path: '/api/v1/reports/map',
    summary: 'Markers inside a bounding box.',
    tag: 'Reports',
    access: 'optional',
    query: mapSchema,
    data: z.strictObject({ items: z.array(MapMarkerSchema) }),
  },
  {
    method: 'post',
    path: '/api/v1/reports/check-duplicates',
    summary: 'Possible duplicates near a location in the same category.',
    tag: 'Reports',
    access: 'user',
    body: checkDuplicatesSchema,
    data: z.strictObject({ possibleDuplicates: z.array(ReportSchema) }),
  },
  {
    method: 'get',
    path: '/api/v1/reports/{id}',
    summary: 'One report with vote counts.',
    tag: 'Reports',
    access: 'optional',
    params: idParams,
    data: report,
  },
  {
    method: 'patch',
    path: '/api/v1/reports/{id}',
    summary: 'Edit a report (owner while SUBMITTED, or an admin).',
    tag: 'Reports',
    access: 'user',
    params: idParams,
    body: updateReportSchema,
    data: report,
  },
  {
    method: 'delete',
    path: '/api/v1/reports/{id}',
    summary: 'Delete a report (owner while SUBMITTED, or an admin).',
    tag: 'Reports',
    access: 'user',
    params: idParams,
    data: deleted,
  },
  {
    method: 'get',
    path: '/api/v1/reports/{id}/history',
    summary: 'Status change timeline.',
    tag: 'Reports',
    access: 'optional',
    params: idParams,
    data: z.strictObject({ history: z.array(StatusHistoryEntrySchema) }),
  },

  // ------------------------------------------------------------- community
  {
    method: 'get',
    path: '/api/v1/reports/{id}/comments',
    summary: 'Comments on a report, oldest first.',
    tag: 'Community',
    access: 'optional',
    params: idParams,
    data: z.strictObject({ comments: z.array(CommentSchema) }),
  },
  {
    method: 'post',
    path: '/api/v1/reports/{id}/comments',
    summary: 'Comment on a report.',
    tag: 'Community',
    access: 'user',
    params: idParams,
    body: commentSchema,
    status: 201,
    data: z.strictObject({ comment: CommentSchema }),
  },
  {
    method: 'delete',
    path: '/api/v1/comments/{id}',
    summary: 'Delete a comment (its author or an admin).',
    tag: 'Community',
    access: 'user',
    params: idParams,
    data: deleted,
  },
  {
    method: 'get',
    path: '/api/v1/reports/{id}/fix-checks',
    summary: "Residents' checks of a report's fixes, and the current fix's tally.",
    tag: 'Community',
    access: 'optional',
    params: idParams,
    data: FixChecksSchema,
  },
  {
    method: 'post',
    path: '/api/v1/reports/{id}/fix-checks',
    summary: "Confirm or dispute a resolved report's fix with a photo (multipart field `photo`).",
    tag: 'Community',
    access: 'user',
    params: idParams,
    multipart: { fields: fixCheckSchema, files: 'photo' },
    status: 201,
    data: z.strictObject({ fixCheck: FixCheckSchema, reopened: z.boolean() }),
  },
  ...(['upvote', 'confirm'] as const).flatMap((vote): ContractRoute[] => [
    {
      method: 'post',
      path: `/api/v1/reports/{id}/${vote}`,
      summary: `Add your ${vote}.`,
      tag: 'Community',
      access: 'user',
      params: idParams,
      data: voteResult,
    },
    {
      method: 'delete',
      path: `/api/v1/reports/{id}/${vote}`,
      summary: `Remove your ${vote}.`,
      tag: 'Community',
      access: 'user',
      params: idParams,
      data: voteResult,
    },
  ]),
  {
    method: 'post',
    path: '/api/v1/reports/{id}/false-report',
    summary: 'Flag a report as false.',
    tag: 'Community',
    access: 'user',
    params: idParams,
    data: voteResult,
  },
  {
    method: 'post',
    path: '/api/v1/reports/{id}/follow',
    summary: 'Follow a report (status change notifications).',
    tag: 'Community',
    access: 'user',
    params: idParams,
    data: followResult,
  },
  {
    method: 'delete',
    path: '/api/v1/reports/{id}/follow',
    summary: 'Stop following a report.',
    tag: 'Community',
    access: 'user',
    params: idParams,
    data: followResult,
  },

  // -------------------------------------------------------------- workflow
  {
    method: 'get',
    path: '/api/v1/admin/reports',
    summary: 'Moderation queue with filters.',
    tag: 'Workflow',
    access: ADMIN,
    query: adminListSchema,
    data: ReportPageSchema,
  },
  {
    method: 'patch',
    path: '/api/v1/admin/reports/{id}/status',
    summary: 'Change status (the state machine decides what each role may do).',
    tag: 'Workflow',
    access: STAFF,
    params: idParams,
    body: statusSchema,
    data: report,
  },
  {
    method: 'patch',
    path: '/api/v1/admin/reports/{id}/assign',
    summary: 'Assign to a department.',
    tag: 'Workflow',
    access: ADMIN,
    params: idParams,
    body: assignSchema,
    data: report,
  },
  {
    method: 'post',
    path: '/api/v1/admin/reports/{id}/resolve',
    summary: 'Mark resolved.',
    tag: 'Workflow',
    access: STAFF,
    params: idParams,
    body: resolveSchema,
    data: report,
  },
  {
    method: 'post',
    path: '/api/v1/admin/reports/{id}/duplicate',
    summary:
      'Merge into an open original: its reporter and followers follow the original from then on.',
    tag: 'Workflow',
    access: ADMIN,
    params: idParams,
    body: duplicateSchema,
    data: report,
  },
  {
    method: 'get',
    path: '/api/v1/admin/reports/{id}/duplicate-candidates',
    summary: 'Likely originals: older open reports of the same kind nearby, nearest first.',
    tag: 'Workflow',
    access: ADMIN,
    params: idParams,
    data: z.strictObject({
      radiusM: z.number().int().positive(),
      candidates: z.array(ReportSchema).meta({ description: 'Each with distanceM, at most 10.' }),
    }),
  },
  {
    method: 'get',
    path: '/api/v1/admin/reports/{id}/priority',
    summary: 'Why a report ranks where it does; null when it is closed (not ranked).',
    tag: 'Workflow',
    access: ADMIN,
    params: idParams,
    data: z.strictObject({ priority: PriorityExplanationSchema.nullable() }),
  },
  {
    method: 'get',
    path: '/api/v1/department/reports',
    summary: "Reports assigned to the caller's department.",
    tag: 'Workflow',
    access: STAFF,
    query: deptListSchema,
    data: ReportPageSchema,
  },

  // --------------------------------------------------------- notifications
  {
    method: 'get',
    path: '/api/v1/notifications',
    summary: 'Your notifications, newest first.',
    tag: 'Notifications',
    access: 'user',
    query: listNotificationsSchema,
    data: NotificationPageSchema,
  },
  {
    method: 'patch',
    path: '/api/v1/notifications/read-all',
    summary: 'Mark all your notifications read.',
    tag: 'Notifications',
    access: 'user',
    data: z.strictObject({ updated: z.number().int().nonnegative() }),
  },
  {
    method: 'patch',
    path: '/api/v1/notifications/{id}/read',
    summary: 'Mark one notification read.',
    tag: 'Notifications',
    access: 'user',
    params: idParams,
    data: z.strictObject({ read: z.literal(true) }),
  },

  // --------------------------------------------------------------- profile
  {
    method: 'get',
    path: '/api/v1/users/me',
    summary: 'Your profile.',
    tag: 'Profile',
    access: 'user',
    data: user,
  },
  {
    method: 'patch',
    path: '/api/v1/users/me',
    summary: 'Update your name, phone or phone visibility.',
    tag: 'Profile',
    access: 'user',
    body: updateMeSchema,
    data: user,
  },
  {
    method: 'get',
    path: '/api/v1/users/me/reports',
    summary: 'Reports you created.',
    tag: 'Profile',
    access: 'user',
    query: listMyReportsSchema,
    data: ReportPageSchema,
  },

  // --------------------------------------------------------------- catalog
  {
    method: 'get',
    path: '/api/v1/categories',
    summary: 'Report categories.',
    tag: 'Catalog',
    access: 'optional',
    query: catalogQuery,
    data: z.strictObject({ categories: z.array(CategorySchema) }),
  },
  {
    method: 'get',
    path: '/api/v1/departments',
    summary: 'Departments.',
    tag: 'Catalog',
    access: 'optional',
    query: catalogQuery,
    data: z.strictObject({ departments: z.array(DepartmentSchema) }),
  },
  {
    method: 'post',
    path: '/api/v1/admin/categories',
    summary: 'Create a category.',
    tag: 'Catalog',
    access: ADMIN,
    body: categoryCreateSchema,
    status: 201,
    data: category,
  },
  {
    method: 'patch',
    path: '/api/v1/admin/categories/{id}',
    summary: 'Update a category.',
    tag: 'Catalog',
    access: ADMIN,
    params: idParams,
    body: categoryUpdateSchema,
    data: category,
  },
  {
    method: 'delete',
    path: '/api/v1/admin/categories/{id}',
    summary: 'Disable a category (existing reports keep it).',
    tag: 'Catalog',
    access: ADMIN,
    params: idParams,
    data: category,
  },
  {
    method: 'post',
    path: '/api/v1/admin/departments',
    summary: 'Create a department.',
    tag: 'Catalog',
    access: ADMIN,
    body: departmentCreateSchema,
    status: 201,
    data: department,
  },
  {
    method: 'patch',
    path: '/api/v1/admin/departments/{id}',
    summary: 'Update a department.',
    tag: 'Catalog',
    access: ADMIN,
    params: idParams,
    body: departmentUpdateSchema,
    data: department,
  },
  {
    method: 'delete',
    path: '/api/v1/admin/departments/{id}',
    summary: 'Disable a department.',
    tag: 'Catalog',
    access: ADMIN,
    params: idParams,
    data: department,
  },

  // ----------------------------------------------------------- admin users
  {
    method: 'get',
    path: '/api/v1/admin/users',
    summary: 'Search and list users.',
    tag: 'Admin users',
    access: ADMIN,
    query: listUsersSchema,
    data: AdminUserPageSchema,
  },
  {
    method: 'patch',
    path: '/api/v1/admin/users/{id}/status',
    summary: 'Activate or deactivate a user.',
    tag: 'Admin users',
    access: ADMIN,
    params: idParams,
    body: userStatusSchema,
    data: adminUser,
  },
  {
    method: 'post',
    path: '/api/v1/admin/users/{id}/reset-password',
    summary: 'Reset to a one-time temporary password (shown once).',
    tag: 'Admin users',
    access: ADMIN,
    params: idParams,
    data: z.strictObject({ user: AdminUserSchema, temporaryPassword: z.string() }),
  },
  {
    method: 'patch',
    path: '/api/v1/admin/users/{id}/role',
    summary: 'Change a role (super admins only).',
    tag: 'Admin users',
    access: ['super_admin'],
    params: idParams,
    body: userRoleSchema,
    data: adminUser,
  },

  // ------------------------------------------------------------ scorecards
  {
    method: 'get',
    path: '/api/v1/scorecards',
    summary: 'Public department scorecards: response and resolution against targets.',
    tag: 'Scorecards',
    access: 'public',
    data: ScorecardsSchema,
  },
  {
    method: 'get',
    path: '/api/v1/hotspots',
    summary: 'Public hotspots: places where reports from the last 90 days cluster.',
    tag: 'Hotspots',
    access: 'public',
    data: HotspotsSchema,
  },
  {
    method: 'get',
    path: '/api/v1/reports/{id}/recurrence',
    summary: 'Earlier reports of the same kind nearby that were fixed before this one.',
    tag: 'Hotspots',
    access: 'public',
    params: idParams,
    data: RecurrenceSchema,
  },

  // ------------------------------------------------------------- analytics
  {
    method: 'get',
    path: '/api/v1/admin/analytics/summary',
    summary: 'Headline numbers and monthly trend.',
    tag: 'Analytics',
    access: ADMIN,
    data: AnalyticsSummarySchema,
  },
  {
    method: 'get',
    path: '/api/v1/admin/analytics/categories',
    summary: 'Totals per category.',
    tag: 'Analytics',
    access: ADMIN,
    data: z.strictObject({ categories: z.array(CategoryAnalyticsSchema) }),
  },
  {
    method: 'get',
    path: '/api/v1/admin/analytics/departments',
    summary: 'Totals and resolution times per department.',
    tag: 'Analytics',
    access: ADMIN,
    data: z.strictObject({ departments: z.array(DepartmentAnalyticsSchema) }),
  },
];
