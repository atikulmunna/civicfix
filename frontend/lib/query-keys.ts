/**
 * Query keys in one place so cache reads, writes and invalidations agree.
 * Every key includes all the params its request depends on.
 */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  categories: ['categories'] as const,
  departments: ['departments'] as const,
  /** Admin catalog lists include inactive items, so they are cached separately. */
  catalog: (listPath: string) => ['catalog', listPath] as const,
  reports: (params: Record<string, unknown>) => ['reports', 'list', params] as const,
  mapMarkers: (params: Record<string, unknown>) => ['reports', 'map', params] as const,
  report: (id: string) => ['reports', 'detail', id] as const,
  reportHistory: (id: string) => ['reports', 'history', id] as const,
  duplicates: (params: { categoryId: string; latitude: number; longitude: number } | null) =>
    ['reports', 'duplicates', params] as const,
  myReports: (page: number) => ['me', 'reports', page] as const,
  adminReports: (params: Record<string, unknown>) => ['admin', 'reports', params] as const,
  /** Under ['admin', 'reports'], so moderation and votes refresh it with the lists. */
  reportPriority: (id: string) => ['admin', 'reports', 'priority', id] as const,
  adminUsers: (params: Record<string, unknown>) => ['admin', 'users', params] as const,
  reportComments: (id: string) => ['reports', 'comments', id] as const,
  notifications: ['notifications'] as const,
  departmentQueue: ['department', 'reports'] as const,
  analytics: (part: 'summary' | 'categories' | 'departments') =>
    ['admin', 'analytics', part] as const,
};

/**
 * Prefixes of every cached list that shows reports (their counts, statuses or
 * membership). Writes that change a report invalidate all of them.
 */
export const reportListPrefixes = [
  ['reports', 'list'],
  ['reports', 'map'],
  ['me', 'reports'],
  ['admin', 'reports'],
  ['department', 'reports'],
] as const;
