/**
 * API types, derived from the backend's contract (R10). Do not hand-edit
 * shapes here: they come from lib/api-schema.ts, which is generated from
 * backend/openapi.json (`npm run api-types`), which the backend generates
 * from the Zod schemas its tests check every response against.
 */
import type { components } from './api-schema';

type Schemas = components['schemas'];

export type Role = Schemas['Role'];
export type ReportStatus = Schemas['ReportStatus'];
export type Severity = Schemas['Severity'];

export type User = Schemas['User'];
export type AdminUser = Schemas['AdminUser'];
export type VoteCounts = Schemas['VoteCounts'];
export type ReportImage = Schemas['ReportImage'];
export type ReportViewerState = Schemas['ReportViewerState'];
export type Category = Schemas['Category'];
export type Department = Schemas['Department'];
export type Report = Schemas['Report'];
export type Comment = Schemas['Comment'];
export type StatusHistoryEntry = Schemas['StatusHistoryEntry'];
export type Notification = Schemas['Notification'];
export type MapMarker = Schemas['MapMarker'];
export type AnalyticsSummary = Schemas['AnalyticsSummary'];
export type CategoryAnalytics = Schemas['CategoryAnalytics'];
export type DepartmentAnalytics = Schemas['DepartmentAnalytics'];
export type PriorityExplanation = Schemas['PriorityExplanation'];

/** A page of items: the API's paginated shape (e.g. ReportPage), for any item type. */
export type Paginated<T> = Omit<Schemas['ReportPage'], 'items'> & { items: T[] };
