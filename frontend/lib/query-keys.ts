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
  report: (id: string) => ['reports', 'detail', id] as const,
  reportHistory: (id: string) => ['reports', 'history', id] as const,
  duplicates: (params: { categoryId: string; latitude: number; longitude: number } | null) =>
    ['reports', 'duplicates', params] as const,
  myReports: (page: number) => ['me', 'reports', page] as const,
  adminReports: (params: Record<string, unknown>) => ['admin', 'reports', params] as const,
  adminUsers: (params: Record<string, unknown>) => ['admin', 'users', params] as const,
};
