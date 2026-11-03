/**
 * Compile-time tests for the contract-typed client (R10b). `npm run
 * typecheck` checks them: a wrong inference fails expectTypeOf, and a call
 * that should not compile but does fails its @ts-expect-error.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { api, type ApiData } from './api';
import type {
  AnalyticsSummary,
  Category,
  Comment,
  Department,
  MapMarker,
  Report,
  User,
} from './types';

describe('contract-typed API client', () => {
  it('infers the response from the path', () => {
    expectTypeOf<ApiData<'get', '/auth/me'>>().toEqualTypeOf<{ user: User }>();
    expectTypeOf<ApiData<'get', `/reports/${string}`>>().toEqualTypeOf<{ report: Report }>();
    expectTypeOf<ApiData<'get', `/reports/${string}/comments`>>().toEqualTypeOf<{
      comments: Comment[];
    }>();
    // A static segment wins over a parameter: /reports/nearby is not /reports/{id}.
    expectTypeOf<ApiData<'get', '/reports/nearby'>>().toEqualTypeOf<{ items: Report[] }>();
    expectTypeOf<ApiData<'get', '/reports/map'>>().toEqualTypeOf<{ items: MapMarker[] }>();
    // One of several routes: the union of their responses.
    expectTypeOf<ApiData<'get', '/categories' | '/departments'>>().toEqualTypeOf<
      { categories: Category[] } | { departments: Department[] }
    >();
    expectTypeOf<ApiData<'get', '/admin/analytics/summary'>>().toEqualTypeOf<AnalyticsSummary>();
    // 201 responses count as success too.
    expectTypeOf<ApiData<'post', '/reports'>>().toEqualTypeOf<{ report: Report }>();
    // A literal id matches its parameter, segment by segment.
    expectTypeOf<ApiData<'get', '/reports/r1'>>().toEqualTypeOf<{ report: Report }>();
    // Fits the coarse pattern but no route: nothing usable comes back.
    expectTypeOf<ApiData<'get', '/reports/r1/oops'>>().toBeNever();
  });

  it('types the response of a call written with a concrete id', () => {
    const id = 'r1';
    expectTypeOf(() => api.get(`/reports/${id}`)).returns.resolves.toEqualTypeOf<{
      report: Report;
    }>();
    expectTypeOf(() => api.del(`/comments/${id}`)).returns.resolves.toEqualTypeOf<{
      deleted: true;
    }>();
  });

  it('rejects calls the contract does not allow', () => {
    // Never called: these lines only have to fail to compile.
    const compileOnly = () => {
      // @ts-expect-error unknown path
      void api.get('/reprots');
      // @ts-expect-error the route exists, but not for GET
      void api.get('/auth/login');
      // @ts-expect-error status must be a ReportStatus
      void api.patch('/admin/reports/r1/status', { status: 'DONE' });
      // @ts-expect-error unknown query parameter
      void api.get('/reports', { colour: 'red' });
    };
    expectTypeOf(compileOnly).toBeFunction();
  });
});
